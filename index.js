require("dotenv/config");

const { getXataClient } = require("./xata");

const { XataCache } = require("./langchain-xata-cache.js");

const { ChatOpenAI } = require("@langchain/openai");

const { ConversationChain } = require("langchain/chains");

const express = require("express");
const app = express();

app.use(express.json());

const xata = getXataClient();

app.post("/query-callback-method", async (req, res) => {
  const { input } = req.body;
  // Set headers before piping the stream
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  const encoder = new TextEncoder();
  const model = new ChatOpenAI({
    streaming: true,
    callbacks: [
      {
        async handleLLMStart() {
          // Look for response in Xata
          const cachedResponse = await xata.db.responses
            .filter({ input })
            .select(["answer"])
            .getFirst();
          // If cached response found, return as is
          if (cachedResponse) {
            res.write("[HIT] " + cachedResponse.answer);
            res.end();
            return;
          }
          res.write(encoder.encode("[MISS] "));
        },
        handleLLMNewToken(token) {
          res.write(encoder.encode(token));
        },
        async handleLLMEnd(output) {
          // Once the response is sent, cache it in Xata
          await xata.db.responses.create({
            input,
            answer: output.generations[0][0].text,
          });
          // End the response
          res.end();
        },
      },
    ],
  });
  const chain = new ConversationChain({ llm: model });
  await chain.call({ input });
});

app.post("/query-cache-method", async (req, res) => {
  const { input } = req.body;
  const model = new ChatOpenAI({
    cache: new XataCache({ client: xata }),
  });
  console.time();
  const response = await model.invoke(input);
  console.timeEnd();
  res.write(response.content);
  res.end();
});

app.listen(3005, () => {
  console.log(`Listening on http://localhost:${3005}`);
});

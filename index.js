require("dotenv/config");

const { getXataClient } = require("./xata");
const { XataCache } = require("./langchain-xata-cache.js");

const { ChatOpenAI } = require("@langchain/openai");

// const { BufferMemory } = require("langchain/memory");
const { ConversationChain } = require("langchain/chains");
// const {
//   XataChatMessageHistory,
// } = require("@langchain/community/stores/message/xata");

const express = require("express");
const app = express();

app.use(express.json());

const xata = getXataClient();

// app.post("/", async (req, res) => {
//   const { messages, chatID } = req.body;
//   const loggedInUserEmail = "rishi18304@iiitd.ac.in";
//   const memory = new BufferMemory({
//     chatHistory: new XataChatMessageHistory({
//       client: xata,
//       table: "messages",
//       createTable: true,
//       apiKey: process.env.XATA_API_KEY,
//       sessionId: loggedInUserEmail + "_" + chatID,
//     }),
//   });
//   const model = new ChatOpenAI();
//   const chain = new ConversationChain({ llm: model, memory });
//   const userMessages = messages.filter((i) => i.role === "user");
//   const { response: data } = await chain.call({
//     input: userMessages[userMessages.length - 1].content,
//   });
//   res.write(data);
//   res.end();
// });

app.post("/query-callback-method", async (req, res) => {
  const { input } = req.body;
  // LookUp for response in Xata
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
  // Set headers before piping the stream
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  const encoder = new TextEncoder();
  const model = new ChatOpenAI({
    streaming: true,
    callbacks: [
      {
        async handleLLMStart() {
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
  const response = await model.invoke(input);
  res.write(response.content);
  res.end();
});

app.listen(3005, () => {
  console.log(`Listening on http://localhost:${3005}`);
});

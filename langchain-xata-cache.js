const {
  BaseCache,
  deserializeStoredGeneration,
  getCacheKey,
  serializeGeneration,
} = require("@langchain/core/caches");

class XataCache extends BaseCache {
  xataClient;
  constructor(props) {
    super();
    this.xataClient = props.client;
  }
  async makeValue(key) {
    const tmp = await this.xataClient.db.invocations.filter({ key }).getFirst();
    if (tmp) return tmp.answer;
  }
  /**
   * Lookup LLM generations in cache by prompt and associated LLM key.
   */
  async lookup(prompt, llmKey) {
    let idx = 0;
    let key = getCacheKey(prompt, llmKey, String(idx));
    let value = await this.makeValue(key);
    const generations = [];
    while (value) {
      generations.push(deserializeStoredGeneration(JSON.parse(value)));
      idx += 1;
      key = getCacheKey(prompt, llmKey, String(idx));
      value = await this.makeValue(key);
    }
    return generations.length > 0 ? generations : null;
  }

  /**
   * Update the cache with the given generations.
   *
   * Note this overwrites any existing generations for the given prompt and LLM key.
   */
  async update(prompt, llmKey, value) {
    for (let i = 0; i < value.length; i += 1) {
      const key = getCacheKey(prompt, llmKey, String(i));
      await this.xataClient.db.invocations.create({
        key,
        answer: JSON.stringify(serializeGeneration(value[i])),
      });
    }
  }
}

exports.XataCache = XataCache;

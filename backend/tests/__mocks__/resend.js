// Jest mock for the Resend SDK — captures sent emails so tests can assert on them.
const sent = [];

class Resend {
  constructor(_apiKey) {}
  get emails() {
    return {
      send: async (msg) => {
        sent.push(msg);
        return { data: { id: `mock_${Date.now()}` }, error: null };
      },
    };
  }
}

module.exports = { Resend, __sent: sent };

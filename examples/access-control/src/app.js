const express = require('express');
const expressGraphql = require('express-graphql');
const schema = require('./schema');

const app = express();

app.use('/graphql', expressGraphql(async (request) => {
  const userId = request.headers.authorization; // the weakest security on earth
  const context = { userId, isApiQuery: true };
  return {
    schema,
    context,
    rootValue: {
      async onQuery(qb) {
        await qb.mergeContext(context);
      },
    },
  };
}));

module.exports = app;


const { Model } = require('objection');
const objectionGraphql = require('objection-graphql');
const knex = require('./knex');
const models = require('./models');

Model.knex(knex);

module.exports = objectionGraphql
  .builder()
  .allModels(Object.values(models))
  .build();

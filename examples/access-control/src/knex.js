const Knex = require('knex');
const knexConfigs = require('../knexfile');

const knexConfig = knexConfigs[process.env.NODE_ENV];

module.exports = Knex(knexConfig);

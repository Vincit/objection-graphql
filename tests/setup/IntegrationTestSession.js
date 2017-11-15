'use strict';

const _ = require('lodash')
  , Knex = require('knex')
  , models = require('./models');

class IntegrationTestSession {

  constructor(config) {
    const knex = Knex(config.knex);
    this.knex = knex;

    this.models = _.mapValues(models, (modelClass) => {
      return modelClass.bindKnex(knex);
    });
  }

  createTables() {
    const knex = this.knex;

    return knex.schema.dropTableIfExists('Person_Movie').then(() => {
      return knex.schema.dropTableIfExists('Review');
    }).then(() => {
      return knex.schema.dropTableIfExists('Person');
    }).then(() => {
      return knex.schema.dropTableIfExists('Movie');
    }).then(() => {
      return knex.schema.createTable('Movie', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.date('release_date');
      });
    }).then(() => {
      return knex.schema.createTable('Person', (table) => {
        table.increments('id').primary();
        table.string('firstName');
        table.string('lastName');
        table.enum('gender', _.values(models.Person.Gender));
        table.integer('age');
        table.json('addresses', true);
        table.integer('parentId').index();
      });
    }).then(() => {
      return knex.schema.createTable('Review', (table) => {
        table.increments('id').primary();
        table.string('title');
        table.integer('stars');
        table.string('text');
        table.integer('movieId').index();
        table.integer('reviewerId').index();
      });
    }).then(() => {
      return knex.schema.createTable('Person_Movie', (table) => {
        table.increments('id').primary();
        table.integer('movieId').index();
        table.integer('personId').index();
      });
    });
  }
}

module.exports = IntegrationTestSession;

'use strict';

var _ = require('lodash')
  , Knex = require('knex')
  , models = require('./models');

function IntegrationTestSession(config) {
  this.knex = Knex(config.knex);
  this.models = _.mapValues(models, function (modelClass) {
    return modelClass.bindKnex(this.knex);
  }, this);
}

IntegrationTestSession.prototype.createTables = function () {
  var knex = this.knex;

  return knex.schema.dropTableIfExists('Movie').then(function () {
    return knex.schema.dropTableIfExists('Person');
  }).then(function () {
    return knex.schema.dropTableIfExists('Review');
  }).then(function () {
    return knex.schema.dropTableIfExists('Movie');
  }).then(function () {
    return knex.schema.dropTableIfExists('Person_Movie');
  }).then(function () {
    return knex.schema.createTable('Movie', function (table) {
      table.bigincrements('id').primary();
      table.string('name');
      table.date('releaseDate');
    });
  }).then(function () {
    return knex.schema.createTable('Person', function (table) {
      table.bigincrements('id').primary();
      table.string('firstName');
      table.string('lastName');
      table.enum('gender', _.values(models.Person.Gender));
      table.integer('age');
      table.json('addresses', true);
      table.biginteger('parentId')
        .references('id')
        .inTable('Person')
        .index();
    });
  }).then(function () {
    return knex.schema.createTable('Review', function (table) {
      table.bigincrements('id').primary();
      table.string('title');
      table.integer('stars');
      table.string('text');
      table.biginteger('movieId')
        .references('id')
        .inTable('Movie')
        .index();
      table.biginteger('reviewerId')
        .references('id')
        .inTable('Person')
        .index();
    });
  }).then(function () {
    return knex.schema.createTable('Person_Movie', function (table){
      table.biginteger('movieId')
        .references('id')
        .inTable('Movie')
        .index();
      table.biginteger('personId')
        .references('id')
        .inTable('Person')
        .index();
    });
  });
};

module.exports = IntegrationTestSession;

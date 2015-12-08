# Very much work in progress

If you still want to try this out, here is a standalone app for your pleasure. Just copy this into a file in
the project root, and run it with a ES6 capable node version. Remember to run `npm install` in the root first.

```js
const SchemaBuilder = require('./lib/SchemaBuilder');
const Person = require('./tests/setup/models/Person');
const Movie = require('./tests/setup/models/Movie');
const Review = require('./tests/setup/models/Review');
const Promise = require('bluebird');
const graphql = require('graphql').graphql;
const Knex = require('knex');
const path = require('path');
const os = require('os');
const _ = require('lodash');

Promise.coroutine(function* () {
  var knex = createKnex();
  yield createSchema(knex);
  yield insertSomeData(knex);

  const graphQlSchema = new SchemaBuilder()
    .model(Person)
    .model(Movie)
    .model(Review)
    .build();

  const result = yield graphql(graphQlSchema, `{
    persons(ageGt: 40, gender: Male, lastNameLike: "%negg%", orderBy: age) {
      id,
      firstName,
      movies(orderBy: releaseDate, nameLikeNoCase: "%erminato%") {
        name,
        actors(ageLte: 100, orderBy: firstName) {
          id
          firstName,
          age
        }
        reviews(starsGt: 2, orderByDesc: stars) {
          title,
          text,
          stars,
          reviewer {
            firstName
          }
        }
      }
    }
  }`, knex);

  console.log(JSON.stringify(result, null, 2));
  yield knex.destroy();
})();

function createKnex() {
  return Knex({
    client: 'sqlite3',
    connection: {
      filename: path.join(os.tmpdir(), 'graphql-objection.db')
    }
  });
}

function createSchema(knex) {
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
      table.enum('gender', _.values(Person.Gender));
      table.integer('age');
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
}

function insertSomeData(knex) {
  return Movie.bindKnex(knex).query().insertWithRelated([{
    name: 'The terminator',
    releaseDate: '1984-10-26',

    actors: [{
      "#id": 'arnold',
      firstName: 'Arnold',
      lastName: 'Schwarzenegger',
      gender: 'Male',
      age: 73,

      parent: {
        firstName: 'Gustav',
        lastName: 'Schwarzenegger',
        gender: 'Male',
        age: 98
      }
    }, {
      firstName: 'Michael',
      lastName: 'Biehn',
      gender: 'Male',
      age: 45
    }],

    reviews: [{
      title: 'Great movie',
      stars: 5,
      text: 'Awesome',

      reviewer: {
        "#id": 'randomDudette',
        firstName: 'Some',
        lastName: 'Random-Dudette',
        gender: 'Female',
        age: 20
      }
    }, {
      title: 'Changed my mind',
      stars: 4,
      text: 'Now I thing this is semi-awesome',

      reviewer: {
        "#ref": 'randomDudette'
      }
    }]
  }, {
    name: 'Terminator 2: Judgment Day',
    releaseDate: '1991-07-03',

    actors: [{
      "#ref": 'arnold'
    }]
  }, {
    name: 'Predator',
    releaseDate: '1987-07-12',

    actors: [{
      "#ref": 'arnold'
    }]
  }]);
}
```
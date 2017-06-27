'use strict';

const _ = require('lodash');
const Model = require('objection').Model;

class Person extends Model {

  static get tableName() {
    return 'Person';
  }

  static get Gender() {
    return {
      Male: 'Male',
      Female: 'Female'
    };
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['firstName', 'lastName'],

      properties: {
        id: {type: 'integer'},
        parentId: {type: ['integer', 'null']},
        firstName: {type: 'string', minLength: 1, maxLength: 255},
        lastName: {type: 'string', minLength: 1, maxLength: 255},
        gender: {type: 'string', enum: _.values(Person.Gender)},
        age: {type: ['number', 'null']},
        addresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              street: {type: 'string'},
              city: {type: 'string'},
              zipCode: {type: 'string'}
            }
          }
        }
      }
    };
  }

  static get relationMappings() {
    const Review = require('./Review');
    const Movie = require('./Movie');

    return {
      reviews: {
        relation: Model.HasManyRelation,
        modelClass: Review,
        join: {
          from: 'Person.id',
          to: 'Review.reviewerId'
        }
      },

      movies: {
        relation: Model.ManyToManyRelation,
        modelClass: Movie,
        join: {
          from: 'Person.id',
          through: {
            from: 'Person_Movie.personId',
            to: 'Person_Movie.movieId'
          },
          to: 'Movie.id'
        }
      },

      parent: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'Person.parentId',
          to: 'Person.id'
        }
      },

      children: {
        relation: Model.HasManyRelation,
        modelClass: Person,
        join: {
          from: 'Person.id',
          to: 'Person.parentId'
        }
      }
    };
  }
}

module.exports = Person;

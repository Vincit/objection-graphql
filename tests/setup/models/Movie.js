'use strict';

const Model = require('objection').Model;

class Movie extends Model {
  static get tableName() {
    return 'Movie';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],

      properties: {
        id: {type: 'integer'},
        name: {type: 'string', minLength: 1, maxLength: 255},
        releaseDate: {anyOf: [
          {type: 'string', format: 'date'},
          {type: 'null'}
        ]}
      }
    };
  }

  static get relationMappings() {
    const Person = require('./Person');
    const Review = require('./Review');
    
    return {
      actors: {
        relation: Model.ManyToManyRelation,
        modelClass: Person,
        join: {
          from: 'Movie.id',
          through: {
            from: 'Person_Movie.movieId',
            to: 'Person_Movie.personId'
          },
          to: 'Person.id'
        }
      },

      reviews: {
        relation: Model.HasManyRelation,
        modelClass: Review,
        join: {
          from: 'Movie.id',
          to: 'Review.movieId'
        }
      }
    };
  }
}

module.exports = Movie;

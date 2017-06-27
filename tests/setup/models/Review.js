'use strict';

const Model = require('objection').Model;

class Review extends Model {
  static get tableName() {
    return 'Review';
  }

  static get jsonSchema() {
    return {
      type: 'object',

      properties: {
        id: {type: 'integer'},
        title: {type: 'string', minLength: 1, maxLength: 255},
        stars: {type: 'integer'},
        text: {type: 'string'},
        reviewerId: {type: 'integer'},
        movieId: {type: 'integer'}
      }
    };
  }

  static get relationMappings() {
    const Person = require('./Person');
    const Movie = require('./Movie');

    return {
      reviewer: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'Review.reviewerId',
          to: 'Person.id'
        }
      },

      movie: {
        relation: Model.BelongsToOneRelation,
        modelClass: Movie,
        join: {
          from: 'Review.movieId',
          to: 'Movie.id'
        }
      }
    };
  }
}

module.exports = Review;

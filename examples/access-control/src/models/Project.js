const BaseModel = require('./BaseModel');

module.exports = class Project extends BaseModel {
  static get jsonSchema() {
    return {
      type: 'object',

      properties: {
        id: { type: 'integer' },
        title: { type: 'string', minLength: 1, maxLength: 255 },
      },
    };
  }

  static get QueryBuilder() {
    return class extends super.QueryBuilder {
      constructor(modelClass) {
        super(modelClass);
        this.runBefore(async (results, qb) => {
          const { userId, isApiQuery } = qb.context();
          if (isApiQuery) {
            qb.where('ownerId', userId);
          }
        });
      }
    };
  }

  static get relationMappings() {
    return {
      owner: {
        relation: this.BelongsToOneRelation,
        modelClass: 'User',
        join: {
          from: 'Project.ownerId',
          to: 'User.id',
        },
      },
    };
  }
};


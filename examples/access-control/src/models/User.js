const BaseModel = require('./BaseModel');

module.exports = class User extends BaseModel {
  static get jsonSchema() {
    return {
      type: 'object',

      properties: {
        id: { type: 'integer' },
        username: { type: 'string', minLength: 1, maxLength: 255 },
        password: { type: 'string', minLength: 1, maxLength: 255 },
      },
    };
  }

  static async modifyApiResults(results, { userId }) {
    results.forEach((result) => {
      if (result.id !== userId) delete result.password;
    });
    return results;
  }

  static get relationMappings() {
    return {
      projects: {
        relation: this.HasManyRelation,
        modelClass: 'Project',
        join: {
          from: 'User.id',
          to: 'Project.ownerId',
        },
      },
    };
  }
};


const { Model } = require('objection');

module.exports = class BaseModel extends Model {
  // Objection Model Configs
  static get modelPaths() {
    return [__dirname];
  }
  static get tableName() {
    return this.name;
  }

  // eslint-disable-next-line
  static async modifyApiQuery(qb, context) {}

  // eslint-disable-next-line no-unused-vars
  static async modifyApiResults(result, context, qb) {
    return result;
  }

  static get QueryBuilder() {
    return class extends super.QueryBuilder {
      constructor(modelClass) {
        super(modelClass);
        this.runBefore(async (result, qb) => {
          const context = qb.context();
          if (!context.isApiQuery) return;
          await modelClass.modifyApiQuery(qb, context);
        });
        this.runAfter(async (result, qb) => {
          const context = qb.context();
          if (!context.isApiQuery) return result;
          return modelClass.modifyApiResults(result, context, qb);
        });
      }
    };
  }
};

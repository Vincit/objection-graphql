const { Model } = require('objection');

module.exports = class BaseModel extends Model {
  // Objection Model Configs
  static get modelPaths() {
    return [__dirname];
  }
  static get tableName() {
    return this.name;
  }
};

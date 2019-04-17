

const _ = require('lodash');

function isExcluded(opt, prop) {
  return (opt.include && opt.include.indexOf(prop) === -1)
      || (opt.exclude && opt.exclude.indexOf(prop) !== -1);
}

function typeNameForModel(modelClass) {
  const schema = modelClass.jsonSchema;
  const name = schema.singleName || schema.title || modelClass.tableName;
  return _.upperFirst(_.camelCase(name));
}

module.exports = {
  isExcluded,
  typeNameForModel,
};

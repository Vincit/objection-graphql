'use strict';

var _ = require('lodash');

module.exports = {
  isExcluded: isExcluded,
  typeNameForModel: typeNameForModel
};

function isExcluded(opt, prop) {
  return (opt.include && opt.include.indexOf(prop) === -1)
      || (opt.exclude && opt.exclude.indexOf(prop) !== -1);
}

function typeNameForModel(modelClass) {
  return _.upperFirst(_.camelCase(modelClass.tableName));
}

'use strict';

const _ = require('lodash');

function isExcluded(opt, prop) {
  return (opt.include && opt.include.indexOf(prop) === -1)
      || (opt.exclude && opt.exclude.indexOf(prop) !== -1);
}

function typeNameForModel(modelClass) {
  return _.upperFirst(_.camelCase(modelClass.tableName));
}

module.exports = {
  isExcluded,
  typeNameForModel
};

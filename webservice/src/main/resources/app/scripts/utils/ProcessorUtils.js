/**
  * Copyright 2017 Hortonworks.
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *   http://www.apache.org/licenses/LICENSE-2.0
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
**/

import _ from 'lodash';
import moment from 'moment';

/*
  getSchemaFields is generic Method for Processors
  Param@ fields = objectArray 'fieldsArr'
  params@ level = number 'level of nesting fields'
  params@ initialFetch = boolean 'this flag is used for joinProcessorNode'
  params@ keyPath = path array ' This value is pass by its own in recursive Method'

  return
  if initialFetch is true it will return two object
  tempFieldsArr = nested fields
  fieldTempArr = is a uniq array of tempFieldsArr filter by name
  else
  it will return only tempFieldsArr = nested fields
*/
const getSchemaFields = function(fields, level, initialFetch, keyPath = []) {
  let fieldTempArr = [] , tempFieldsArr = [];
  const getSchemaNestedFields = (fields, level, keyPath) => {
    fields.map((field) => {
      let obj = {
        name: field.name,
        optional: field.optional,
        type: field.type,
        level: level,
        keyPath: ''
      };

      if (field.type === 'NESTED') {
        obj.disabled = true;
        let _keypath = keyPath.slice();
        _keypath.push(field.name);
        // level === 1 ? obj.keyPath = _keypath[0] : '';
        obj.keyPath = keyPath.join('.');
        tempFieldsArr.push(obj);
        getSchemaNestedFields(field.fields, level + 1, _keypath);
      } else {
        obj.disabled = false;
        obj.keyPath = keyPath.join('.');
        tempFieldsArr.push(obj);
      }
    });
    // To make a unique field array
    // initialFetch is use to populate fields only for once
    initialFetch
      ? fieldTempArr = _.uniqBy(tempFieldsArr, 'name')
      : '';
    return initialFetch ? {tempFieldsArr,fieldTempArr} : tempFieldsArr;
  };
  return getSchemaNestedFields(fields, level, keyPath);
};

/*
  createSelectedKeysHierarchy is generic Method for Processors
  params@ arrKeys = objectArray 'arr selected by select2'
  params@ fieldList = objectArray ' it a fieldList array to filter the nesting by name'

  return
  objectArray with nested value for the particular fields by using fieldList array
*/
const createSelectedKeysHierarchy = function(arrKeys,fieldList){
  let tempArr = [];
  const grouped = _.groupBy(arrKeys, (d) => {
    return d.keyPath;
  });

  _.each(grouped, (d, key) => {
    if (key.length > 0) {
      let fieldNames = key.split('.');
      let _arr = tempArr;
      fieldNames.forEach((name, i) => {

        function find(_tempArr) {
          let fieldD;
          _.each(_tempArr, (_d) => {
            const tempkey = _d.keyPath ? _d.keyPath.split('.') : [];
            tempkey.push(_d.name);
            let flag = true;
            _.each(tempkey, (k, ind) => {
              if(k != key.split('.')[ind]){
                flag = false;
              }
            });

            if (_d.name == name && flag) {
              fieldD = _d;
            } else if (_d.fields && _d.fields.length && flag) {
              fieldD = find(_d.fields);
            }
          });
          return fieldD;
        }
        let fieldData = find(tempArr);
        let _fieldData;
        if (fieldData) {
          _fieldData = fieldData;
        } else {
          fieldData = _.find(fieldList, (fld) => {
            // {name: name, keyPath: key}
            const tempkey = fld.keyPath ? fld.keyPath.split('.') : [];
            tempkey.push(fld.name);
            let flag = true;
            _.each(tempkey, (k, ind) => {
              if(k != key.split('.')[ind]){
                flag = false;
              }
            });
            if(fld.name == name && flag) {return fld; }
          });
          _fieldData = JSON.parse(JSON.stringify(fieldData));
        }

        _fieldData.fields = _fieldData.fields || [];
        if (_arr.indexOf(_fieldData) == -1) {
          _arr.push(_fieldData);
        }
        _arr = _fieldData.fields;
        if (i == fieldNames.length - 1) {
          var cloned = JSON.parse(JSON.stringify(d));
          _arr.push.apply(_arr, cloned);
        }
      });
    } else {
      var cloned = JSON.parse(JSON.stringify(d));
      tempArr.push.apply(tempArr, cloned);
    }
  });
  return tempArr;
};

/*
  populateFieldsArr is generic Method for Processors
  params@ arr = objectArray 'it like udflist'
  params@ string = string 'FUNCTION OR AGGREGATE'

  return
  It objectArray filtering the arr by string
*/
const populateFieldsArr = function(arr,string){
  const fieldList = [];
  arr.map((funcObj) => {
    if (funcObj.type === string) {
      fieldList.push(funcObj);
    }
  });
  return fieldList;
};

/*
  getKeysAndGroupKey is generic Method for Processors
  params@ arr = objectArray 'selected value from select2'

  return
  two object keys and gKeys
  keys of array with individual string for select2 'driverId'
  gkeys of array with individual nested string with grouping 'address[streetaddress]'
*/
const getKeysAndGroupKey = function(arr){
  let keys = [];
  let gKeys = [];
  if (arr && arr.length > 0) {
    for (let k of arr) {
      if (k.level !== 0) {
        let t = '';
        let parents = k.keyPath.split('.');
        let s = parents.splice(0, 1);
        parents.push(k.name);
        t = s + "['" + parents.toString().replace(/,/g, "']['") + "']";
        gKeys.push(t);
      } else {
        gKeys.push(k.name);
      }
      keys.push(k.name);
    }
  }
  return {keys,gKeys};
};


/*
  getKeyList is generic Method for Processors
  params@ argName = string 'argument name'
  params@ keyListArr = objectArray 'udfList or functionListArr'

  return
  objectArray filter by argName
*/
const getKeyList = function(argName,keyListArr){
  let fieldObj = keyListArr.find((field) => {
    return field.name === argName;
  });
  return fieldObj;
};

/*
  normalizationProjectionKeys is generic Method for Processors
  this function is used when we perfetch the value from server
  params@ projectionsArr = objectArray 'projections from Processors'
  params@ fieldList = objectArray 'udfList or functionListArr'

  return
  two objectArray
  keyArrObj it remove the expr key with nested obj
  argsFieldsArrObj it clear the '[]' and
  return obj.args is array so we need to tweek it on windows but for projection is works fine.
*/
const normalizationProjectionKeys = function(projectionsArr,fieldList){
  let keyArrObj = [],argsFieldsArrObj = [];
  projectionsArr.map(o => {
    if (o.expr) {
      if (o.expr.search('\\[') !== -1) {
        let n = o.expr.replace(/([.'\[\]\/\\])/g, " ").split(" ");
        let a = _.compact(n);
        o.expr = a[a.length - 1];
      }
      const obj = this.getKeyList(o.expr,fieldList);
      if(obj){
        keyArrObj.push(obj);
      }
    } else {
      let argsArr = [];
      if(_.isArray(o.args)){
        _.map(o.args,(arg) => {
          if (arg.search('\\[') !== -1) {
            let n = arg.replace(/([.'\[\]\/\\])/g, " ").split(" ");
            let a = _.compact(n);
            arg = a[a.length - 1];
          }
          argsArr.push(arg);
        });
      }
      o.args = argsArr;
      argsFieldsArrObj.push(o);
    }
  });
  return {keyArrObj,argsFieldsArrObj};
};

/*
  modifyGroupKeyByDots accept the groupArr return by getKeysAndGroupKey 'gKeys'
  This is used for only JoinProcessor
  And return like "streamId:address.city.ui"

  modifyGroupKeyByDots accept the groupArr with pattern "streams['address']['city']"
  And replce it with dots example "streams.address.city"
  return the array
*/
const modifyGroupKeyByDots = function(groupArr){
  let dottedKeys = [];
  _.map(groupArr, (k) => {
    let t = k.replace(/\']\['/g, '.').replace("['"," ").replace("']"," ").split(" ");
    const streamId = t[0];
    t.length > 1 ? t.splice(0,1) : '';
    dottedKeys.push(streamId+':'+_.compact(t));
  });
  return dottedKeys;
};



export default {
  getSchemaFields,
  createSelectedKeysHierarchy,
  populateFieldsArr,
  getKeysAndGroupKey,
  getKeyList,
  normalizationProjectionKeys,
  modifyGroupKeyByDots
};

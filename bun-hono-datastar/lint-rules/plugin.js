import { definePlugin } from "@oxlint/plugins";

import assertStrictImport from "./assert-strict-import.js";
import {
  enforceDeleteWithWhere,
  enforceUpdateWithWhere,
} from "./enforce-where.js";
import noComplexIfCondition from "./no-complex-if-condition.js";
import noConsecutiveParametersSameType from "./no-consecutive-parameters-same-type.js";
import noDate from "./no-date.js";
import noDirectPhosphorIcons from "./no-direct-phosphor-icons.js";
import noImportExtensions from "./no-import-extensions.js";
import noImportMetaEnv from "./no-import-meta-env.js";
import noJsonParse from "./no-json-parse.js";
import noMultiplePositionalBooleans from "./no-multiple-positional-booleans.js";
import zodV4Import from "./zod-v4-import.js";

export default definePlugin({
  meta: { name: "local" },
  rules: {
    "assert-strict-import": assertStrictImport,
    "enforce-delete-with-where": enforceDeleteWithWhere,
    "enforce-update-with-where": enforceUpdateWithWhere,
    "no-complex-if-condition": noComplexIfCondition,
    "no-consecutive-parameters-same-type": noConsecutiveParametersSameType,
    "no-date": noDate,
    "no-direct-phosphor-icons": noDirectPhosphorIcons,
    "no-import-extensions": noImportExtensions,
    "no-import-meta-env": noImportMetaEnv,
    "no-json-parse": noJsonParse,
    "no-multiple-positional-booleans": noMultiplePositionalBooleans,
    "zod-v4-import": zodV4Import,
  },
});

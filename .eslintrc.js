const on = 1;
const off = 0;
module.exports = {
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  extends: [
    "eslint:recommended",
  ],
  plugins: ["@typescript-eslint"],
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: "module", // Allows for the use of imports
    project: "./tsconfig.json",
  },
  ignorePatterns: [
    "node_modules/",
    "database/migration/**/*"
  ],
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  rules: {
    "@typescript-eslint/await-thenable": on,
    "@typescript-eslint/class-name-casing": on,
    "@typescript-eslint/member-delimiter-style": [on, {
      "multiline": {
        "delimiter": "semi",
        "requireLast": true,
      },
      "singleline": {
        "requireLast": false,
      },
    }],
    "@typescript-eslint/no-array-constructor": on,
    "@typescript-eslint/no-extra-non-null-assertion": on,
    "@typescript-eslint/no-floating-promises": on,
    "@typescript-eslint/no-for-in-array": on,
    "@typescript-eslint/no-misused-new": on,
    "@typescript-eslint/no-unused-expressions": off,
    "@typescript-eslint/prefer-for-of": off,
    "@typescript-eslint/prefer-includes": on,
    "@typescript-eslint/prefer-nullish-coalescing": on,
    "@typescript-eslint/prefer-optional-chain": on,
    "@typescript-eslint/prefer-string-starts-ends-with": off,
    "@typescript-eslint/require-array-sort-compare": on,
    "@typescript-eslint/restrict-plus-operands": off,
    // "@typescript-eslint/restrict-template-expressions": [on, {
    // 	"allowNumber": true,
    // 	"allowBoolean": true,
    // 	"allowNullable": true,
    // }],
    "@typescript-eslint/semi": [on, "always", {
      "omitLastInOneLineBlock": true,
    }],
    "@typescript-eslint/space-before-function-paren": [on, {
      "asyncArrow": "always",
      "anonymous": "never",
      "named": "never",
    }],
    "@typescript-eslint/type-annotation-spacing": on,
    "@typescript-eslint/unbound-method": off,
    "@typescript-eslint/unified-signatures": on,

    "no-import-assign": on,
    "no-inner-declarations": off,
    "no-setter-return": on,
    "no-unreachable": off,
    "array-callback-return": on,
    "complexity": on,
    "consistent-return": on,
    "default-param-last": on,
    "eqeqeq": on,
    "no-invalid-this": off,
    "no-loop-func": off,
    "no-return-await": on,
    "no-return-assign": off,
    "no-self-compare": on,
    "no-sequences": on,
    "no-constant-condition": off,
    "no-throw-literal": off,
    "require-atomic-updates": off,
    "no-unused-expressions": off,
    "prefer-regex-literals": on,
    "radix": on,

    "no-label-var": on,
    "no-use-before-define": [off, {
      "functions": false,
      "classes": false,
    }],
    "no-undefined": off,
    "no-unused-vars": off,

    "brace-style": off,
    "comma-dangle": [on, {
      "arrays": "always-multiline",
      "objects": "always-multiline",
      "imports": "always-multiline",
      "exports": "always-multiline",
      "functions": "always-multiline"
    }],
    "func-call-spacing": on,
    "keyword-spacing": on,
    "linebreak-style": on,
    "max-len": [on, {
      "code": 200,
      "tabWidth": 2,
      "ignoreComments": true,
      "ignorePattern": "^import.*",
    }],
    "max-params": [off, {
      "max": 6,
    }],
    "newline-per-chained-call": off,
    "no-nested-ternary": on,
    "no-new-object": on,
    "no-tabs": on,
    "no-debugger": off,
    "no-unneeded-ternary": [on, {
      "defaultAssignment": false,
    }],
    "no-whitespace-before-property": on,
    "one-var": [on, 'never'],
    "quotes": [on, 'single'],
    "semi": off, // overridden by typescript rule
    "space-before-function-paren": off, // overridden by typescript rule
    "space-before-blocks": [on, 'always'],
    "space-in-parens": [on, 'never'],
    "space-unary-ops": [
      on, {
        "words": true,
        "nonwords": false,
      },
    ],
    "arrow-spacing": on,
    "no-const-assign": on,
    "no-dupe-class-members": on,
    "no-duplicate-imports": on,
    "no-this-before-super": on,
    "no-var": on,
    "prefer-arrow-callback": on,
    "prefer-const": on,
    "prefer-numeric-literals": on,
  }
};
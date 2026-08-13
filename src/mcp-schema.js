export function strictInputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const next = { ...schema };
  if (schema.properties) {
    next.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, strictInputSchema(value)]),
    );
  }
  if (schema.items) next.items = strictInputSchema(schema.items);
  if (schema.type === 'object' && schema.properties && schema.additionalProperties === undefined) {
    next.additionalProperties = false;
  }
  if (Array.isArray(schema.allOf)) next.allOf = schema.allOf.map((item) => strictInputSchema(item));
  if (schema.if) next.if = strictInputSchema(schema.if);
  if (schema.then) next.then = strictInputSchema(schema.then);
  return next;
}

export function strictToolDefinition(tool) {
  return { ...tool, inputSchema: strictInputSchema(tool.inputSchema) };
}

function typeMatches(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function validate(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}.`);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path} must equal ${JSON.stringify(schema.const)}.`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errors.push(`${path} must be one of: ${schema.enum.join(', ')}.`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} must contain at least ${schema.minLength} character(s).`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} must contain at most ${schema.maxLength} character(s).`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path} must be a valid date-time.`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} must contain at most ${schema.maxItems} item(s).`);
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`, errors));
  }

  const objectLikeSchema = schema.type === 'object' || schema.properties || schema.required;
  if (objectLikeSchema && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required.`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed.`);
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validate(value[key], propertySchema, `${path}.${key}`, errors);
    }
  }

  for (const clause of schema.allOf || []) {
    if (clause.if) {
      const probe = [];
      validate(value, clause.if, path, probe);
      if (probe.length === 0 && clause.then) validate(value, clause.then, path, errors);
    } else {
      validate(value, clause, path, errors);
    }
  }
}

export function validateToolArguments(schema, value) {
  const strictSchema = strictInputSchema(schema);
  const errors = [];
  validate(value, strictSchema, 'arguments', errors);
  if (errors.length) throw new Error(`Invalid tool arguments: ${errors[0]}`);
  return value;
}

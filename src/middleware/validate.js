const Joi = require('joi');

const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required()
      .messages({
        'string.alphanum': 'Username must only contain alphanumeric characters',
        'string.min': 'Username must be at least 3 characters',
        'string.max': 'Username must be less than 30 characters'
      }),
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address'
      }),
    password: Joi.string().min(6).max(100).required()
      .messages({
        'string.min': 'Password must be at least 6 characters'
      })
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  note: Joi.object({
    title: Joi.string().min(1).max(200).required()
      .messages({
        'string.empty': 'Note title is required',
        'string.max': 'Title must be less than 200 characters'
      }),
    content: Joi.string().max(10000).allow('', null)
      .messages({
        'string.max': 'Content must be less than 10000 characters'
      }),
    category_id: Joi.number().integer().positive().allow(null),
    is_pinned: Joi.boolean(),
    tags: Joi.array().items(Joi.string().max(30)).max(10)
      .messages({
        'array.max': 'Maximum 10 tags allowed per note'
      })
  }),

  category: Joi.object({
    name: Joi.string().min(1).max(50).required()
      .messages({
        'string.empty': 'Category name is required',
        'string.max': 'Category name must be less than 50 characters'
      }),
    color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).default('#3B82F6')
      .messages({
        'string.pattern.base': 'Color must be a valid hex color code (e.g., #3B82F6)'
      })
  }),

  shareNote: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address'
      }),
    permission: Joi.string().valid('read', 'edit').default('read')
      .messages({
        'any.only': 'Permission must be either "read" or "edit"'
      })
  }),

  template: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).allow('', null),
    title_template: Joi.string().max(200).allow('', null),
    content_template: Joi.string().max(10000).allow('', null),
    is_public: Joi.boolean().default(false)
  })
};

const validate = (schemaName) => {
 return (req, res, next) => {
  const schema = schemas[schemaName];

  const { error, value } = schema.validate(req.body, { 
      abortEarly: false, 
      convert: true 
    });

  if (error) {
   return next(error);
  }

  req.body = value; 
  next();
 };
};

module.exports = { validate };
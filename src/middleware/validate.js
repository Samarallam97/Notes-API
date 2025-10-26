// // Validation middleware for input data

// const validateRegister = (req, res, next) => {
//   const { username, email, password } = req.body;

//   if (!username || !email || !password) {
//     return res.status(400).json({
//       success: false,
//       error: 'Please provide username, email, and password'
//     });
//   }

//   // Email validation
//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     return res.status(400).json({
//       success: false,
//       error: 'Please provide a valid email'
//     });
//   }

//   // Password validation
//   if (password.length < 6) {
//     return res.status(400).json({
//       success: false,
//       error: 'Password must be at least 6 characters'
//     });
//   }

//   next();
// };

// const validateLogin = (req, res, next) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({
//       success: false,
//       error: 'Please provide email and password'
//     });
//   }

//   next();
// };

// const validateNote = (req, res, next) => {
//   const { title } = req.body;

//   if (!title || title.trim() === '') {
//     return res.status(400).json({
//       success: false,
//       error: 'Please provide a note title'
//     });
//   }

//   next();
// };

// module.exports = { validateRegister, validateLogin, validateNote };


const Joi = require('joi');

// Validation schemas using Joi
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
  })
};

// Middleware factory to validate request body
const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    req.body = value;
    next();
  };
};

module.exports = { validate };
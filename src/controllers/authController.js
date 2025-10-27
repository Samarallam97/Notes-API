const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../config/database");

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  public
exports.register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const pool = await getPool();

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool
      .request()
      .input("username", sql.NVarChar, username)
      .input("email", sql.NVarChar, email)
      .input("password", sql.NVarChar, hashedPassword).query(`
        INSERT INTO Users (username, email, password)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.role, INSERTED.created_at
        VALUES (@username, @email, @password)
      `);

    const user = result.recordset[0];
    const token = generateToken(user.id, user.role);

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Login a user
// @route   POST /api/auth/login
// @access  public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .query("SELECT // FROM Users WHERE email = @email");

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const token = generateToken(user.id, user.role);

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current logged in user
// @route   POST /api/auth/me
// @access  private

exports.getMe = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, req.user.id)
      .query(
        "SELECT id, username, email, role, created_at FROM Users WHERE id = @id"
      );

    res.json({
      success: true,
      data: result.recordset[0],
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a new admin user (Root Admin only)
// @route   POST /api/auth/admin
// @access  Private (Root Admin)

exports.createAdmin = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const pool = await getPool();

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool
      .request()
      .input("username", sql.NVarChar, username)
      .input("email", sql.NVarChar, email)
      .input("password", sql.NVarChar, hashedPassword)
      .input("role", sql.NVarChar, "admin") // <-- Explicitly set role
      .query(`
    INSERT INTO Users (username, email, password, role)
    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email, INSERTED.role
    VALUES (@username, @email, @password, @role)
   `);

    const newAdmin = result.recordset[0];

    res.status(201).json({
      success: true,
      message: "Admin user created successfully",
      data: newAdmin,
    });
  } catch (err) {
    next(err);
  }
};

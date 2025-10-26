// *** Make sure to import 'sql' from your db config ***
const { sql } = require('../config/database'); 

/**
 * Helper class for pagination, search, and filtering.
 * This version uses an alias prefix to avoid ambiguous columns
 * and parameterized queries to prevent SQL injection.
 */
class APIFeatures {
  constructor(query, queryString) {
    this.alias = query; // This will be 'n' from your controller
    this.aliasPrefix = this.alias ? `${this.alias}.` : ''; // Creates 'n.'
    this.queryString = queryString;
    
    // Object to hold filter parameters safely
    this.filterParams = {};
  }

  /**
   * Builds pagination SQL (OFFSET/FETCH)
   */
  paginate() {
    const page = parseInt(this.queryString.page) || 1;
    const limit = Math.min(
      parseInt(this.queryString.limit) || parseInt(process.env.DEFAULT_PAGE_SIZE),
      parseInt(process.env.MAX_PAGE_SIZE)
    );
    const offset = (page - 1) * limit;

    this.pagination = {
      page,
      limit,
      offset,
      sql: `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
    };

    return this;
  }

  /**
   * Builds search SQL (LIKE)
   */
  search() {
    if (this.queryString.search) {
      const searchTerm = this.queryString.search.trim();
      // Add alias prefix to columns
      this.searchCondition = `AND (${this.aliasPrefix}title LIKE @search OR ${this.aliasPrefix}content LIKE @search)`;
      this.searchParam = `%${searchTerm}%`;
    } else {
      this.searchCondition = '';
      this.searchParam = null;
    }
    return this;
  }

  /**
   * Builds filter SQL (AND conditions) using secure parameters
   */
  filter() {
    const filters = [];
    
    // Filter by category
    if (this.queryString.category_id) {
      filters.push(`${this.aliasPrefix}category_id = @filter_category_id`);
      this.filterParams.filter_category_id = { 
        type: sql.Int, 
        value: parseInt(this.queryString.category_id) 
      };
    }

    // Filter by pinned status
    if (this.queryString.is_pinned !== undefined) {
      const isPinned = this.queryString.is_pinned === 'true' ? 1 : 0;
      filters.push(`${this.aliasPrefix}is_pinned = @filter_is_pinned`);
      this.filterParams.filter_is_pinned = { 
        type: sql.Bit, 
        value: isPinned 
      };
    }

    // Filter by date range (NOW SECURE)
    if (this.queryString.date_from) {
      filters.push(`${this.aliasPrefix}created_at >= @filter_date_from`);
      this.filterParams.filter_date_from = { 
        type: sql.DateTime, // Use sql.Date or sql.DateTime2 if more appropriate
        value: new Date(this.queryString.date_from) 
      };
    }
    if (this.queryString.date_to) {
      filters.push(`${this.aliasPrefix}created_at <= @filter_date_to`);
      this.filterParams.filter_date_to = { 
        type: sql.DateTime, 
        value: new Date(this.queryString.date_to) 
      };
    }

    this.filterCondition = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    return this;
  }

  /**
   * Builds sorting SQL (ORDER BY)
   */
  sort() {
    const sortBy = this.queryString.sort || 'updated_at';
    const order = this.queryString.order === 'asc' ? 'ASC' : 'DESC';
    
    // Validate sort field to prevent SQL injection
    const allowedFields = ['title', 'created_at', 'updated_at'];
    const field = allowedFields.includes(sortBy) ? sortBy : 'updated_at';
    
    // Add alias prefix
    this.sortSQL = `ORDER BY ${this.aliasPrefix}${field} ${order}`;
    return this;
  }

  /**
   * Generates pagination metadata for the response
   */
  getPaginationMeta(totalCount) {
    const { page, limit } = this.pagination;
    const totalPages = Math.ceil(totalCount / limit);
    
    return {
      page,
      limit,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }
}

module.exports = APIFeatures;
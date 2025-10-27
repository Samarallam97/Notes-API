const { sql } = require('../config/database'); 

class APIFeatures {
  constructor(query, queryString) {
    this.alias = query; 
    this.aliasPrefix = this.alias ? `${this.alias}.` : ''; 
    this.queryString = queryString;
    
    this.searchCondition = '';
    this.searchParam = null;
    this.filterCondition = '';
    this.filterParams = {};
    this.sortSQL = ''; 
    
    this.pagination = {
      sql: '',
      page: 1,
      limit: 10,
      offset: 0
    };
  }

  paginate() {
    const defaultLimit = parseInt(process.env.DEFAULT_PAGE_SIZE) || 10;
    const maxLimit = parseInt(process.env.MAX_PAGE_SIZE) || 50;

    const page = parseInt(this.queryString.page) || 1;
    let limit = parseInt(this.queryString.limit) || defaultLimit;
    
    // Enforce the maximum page size
    if (limit > maxLimit) {
      limit = maxLimit;
    }

    const offset = (page - 1) * limit;

    this.pagination = {
      page,
      limit,
      offset,
      sql: `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
    };

    return this;
  }

  search() {
    if (this.queryString.search) {
      const searchTerm = this.queryString.search.trim();

      this.searchCondition = `AND (${this.aliasPrefix}title LIKE @search OR ${this.aliasPrefix}content LIKE @search)`;
      this.searchParam = `%${searchTerm}%`;
    }
    return this;
  }

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

    // Filter by date range
    if (this.queryString.date_from) {
      filters.push(`${this.aliasPrefix}created_at >= @filter_date_from`);
      this.filterParams.filter_date_from = { 
        type: sql.DateTime, 
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

  sort() {
    const sortBy = this.queryString.sort || 'updated_at';
    const order = this.queryString.order === 'asc' ? 'ASC' : 'DESC';
    
    // Validate sort field
    const allowedFields = ['title', 'created_at', 'updated_at'];
    const field = allowedFields.includes(sortBy) ? sortBy : 'updated_at';
    
    this.sortSQL = `ORDER BY ${this.aliasPrefix}${field} ${order}`;
    
    return this;
  }

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
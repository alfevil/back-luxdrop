const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { category, brand, min_price, max_price, search, sort, featured, limit = 20, offset = 0 } = req.query;

  try {
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND c.slug = $${paramCount}`;
      params.push(category);
    }

    if (brand) {
      paramCount++;
      query += ` AND LOWER(p.brand) = LOWER($${paramCount})`;
      params.push(brand);
    }

    if (min_price) {
      paramCount++;
      query += ` AND p.price >= $${paramCount}`;
      params.push(min_price);
    }

    if (max_price) {
      paramCount++;
      query += ` AND p.price <= $${paramCount}`;
      params.push(max_price);
    }

    if (search) {
      paramCount++;
      query += ` AND (LOWER(p.name) LIKE LOWER($${paramCount}) OR LOWER(p.brand) LIKE LOWER($${paramCount}))`;
      params.push(`%${search}%`);
    }

    if (featured === 'true') {
      query += ` AND p.is_featured = true`;
    }

    switch (sort) {
      case 'price_asc': query += ' ORDER BY p.price ASC'; break;
      case 'price_desc': query += ' ORDER BY p.price DESC'; break;
      case 'rating': query += ' ORDER BY p.rating DESC'; break;
      case 'newest': query += ' ORDER BY p.created_at DESC'; break;
      default: query += ' ORDER BY p.is_featured DESC, p.created_at DESC';
    }

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
    const countParams = params.slice(0, params.length - 2);
    if (countParams.length > 0) {
    }

    res.json({
      products: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/categories', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      'SELECT c.*, COUNT(p.id) as products_count FROM categories c LEFT JOIN products p ON c.id = p.category_id GROUP BY c.id ORDER BY c.name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await db.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/', adminMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { name, brand, description, price, original_price, category_id, images, sizes, colors, stock, sku, is_featured } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO products (name, brand, description, price, original_price, category_id, images, sizes, colors, stock, sku, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, brand, description, price, original_price, category_id, images, sizes, colors, stock, sku, is_featured]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', adminMiddleware, async (req, res) => {
  const db = req.app.locals.db;
  const { name, brand, description, price, original_price, images, sizes, colors, stock, is_featured } = req.body;

  try {
    const result = await db.query(
      `UPDATE products SET 
        name = COALESCE($1, name),
        brand = COALESCE($2, brand),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        original_price = COALESCE($5, original_price),
        images = COALESCE($6, images),
        sizes = COALESCE($7, sizes),
        colors = COALESCE($8, colors),
        stock = COALESCE($9, stock),
        is_featured = COALESCE($10, is_featured)
       WHERE id = $11 RETURNING *`,
      [name, brand, description, price, original_price, images, sizes, colors, stock, is_featured, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

module.exports = router;

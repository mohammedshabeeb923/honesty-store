/**
 * Seed 27 Ice Cream Products from United Ice Creams Invoice (09-November-2026)
 * Strict Additive Ingestion:
 * - Upserts all 27 products to Supabase PostgreSQL products table
 * - Upserts all 27 products to local data/db-fallback.json
 * - Verifies mathematical totals:
 *   * 27 Products
 *   * 497 Opening pieces
 *   * ₹11,832.60 Purchase Cost
 *   * ₹15,170.00 Total Potential Revenue at MRP
 *   * ₹3,337.40 Theoretical Gross Profit
 */

const fs = require('fs');
const path = require('path');
const serverSupabase = require('../server-supabase.js');

const ICE_CREAM_PRODUCTS = [
  {
    id: 'yuki_cup_vanilla_40_ml',
    name: 'YuKi Cup Vanilla - 40 ML',
    reference_name: 'YUKI CUP VANILLA 40ML',
    variant: '40 ML Cup',
    category: 'Ice Cream',
    price: 10,
    selling_price: 10,
    purchase_price: 7.80,
    stock: 48,
    expected_stock: 48,
    physical_stock: 48,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Cup Vanilla 40 ML Ice Cream'
  },
  {
    id: 'yuki_vanilla_ball',
    name: 'YuKi Vanilla Ball',
    reference_name: 'YUKI VANILLA BALL',
    variant: 'Vanilla Ball',
    category: 'Ice Cream',
    price: 20,
    selling_price: 20,
    purchase_price: 15.60,
    stock: 18,
    expected_stock: 18,
    physical_stock: 18,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Vanilla Ball Ice Cream'
  },
  {
    id: 'yuki_baby_richy',
    name: 'YuKi Baby Richy',
    reference_name: 'YUKI BABY RICHY',
    variant: 'Baby Richy',
    category: 'Ice Cream',
    price: 25,
    selling_price: 25,
    purchase_price: 19.50,
    stock: 16,
    expected_stock: 16,
    physical_stock: 16,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Baby Richy Ice Cream'
  },
  {
    id: 'yuki_hazel_bar',
    name: 'YuKi Hazel Bar',
    reference_name: 'YUKI HAZEL BAR',
    variant: 'Hazel Bar',
    category: 'Ice Cream',
    price: 40,
    selling_price: 40,
    purchase_price: 31.20,
    stock: 32,
    expected_stock: 32,
    physical_stock: 32,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Hazel Bar Ice Cream'
  },
  {
    id: 'yuki_cherry_blossom_bar',
    name: 'YuKi Cherry Blossom Bar',
    reference_name: 'YUKI CHERRY BLOSSOM BAR',
    variant: 'Cherry Blossom Bar',
    category: 'Ice Cream',
    price: 40,
    selling_price: 40,
    purchase_price: 31.20,
    stock: 32,
    expected_stock: 32,
    physical_stock: 32,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Cherry Blossom Bar Ice Cream'
  },
  {
    id: 'yuki_coconut_bar',
    name: 'YuKi Coconut Bar',
    reference_name: 'YUKI COCONUT BAR',
    variant: 'Coconut Bar',
    category: 'Ice Cream',
    price: 40,
    selling_price: 40,
    purchase_price: 31.20,
    stock: 32,
    expected_stock: 32,
    physical_stock: 32,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Coconut Bar Ice Cream'
  },
  {
    id: 'yuki_choco_titan_bar',
    name: 'YuKi Choco Titan Bar',
    reference_name: 'YUKI CHOCO TITAN BAR',
    variant: 'Choco Titan Bar',
    category: 'Ice Cream',
    price: 30,
    selling_price: 30,
    purchase_price: 23.40,
    stock: 50,
    expected_stock: 50,
    physical_stock: 50,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Choco Titan Bar Ice Cream'
  },
  {
    id: 'yuki_mango_vanilla_mikkusu_bar',
    name: 'YuKi Mango Vanilla Mikkusu Bar',
    reference_name: 'YUKI MANGO VANILLA MIKKUSU BAR',
    variant: 'Mango Vanilla Mikkusu Bar',
    category: 'Ice Cream',
    price: 30,
    selling_price: 30,
    purchase_price: 23.40,
    stock: 25,
    expected_stock: 25,
    physical_stock: 25,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mango Vanilla Mikkusu Bar Ice Cream'
  },
  {
    id: 'yuki_mini_chocobar',
    name: 'YuKi Mini Chocobar',
    reference_name: 'YUKI MINI CHOCOBAR',
    variant: 'Mini Chocobar',
    category: 'Ice Cream',
    price: 20,
    selling_price: 20,
    purchase_price: 15.60,
    stock: 20,
    expected_stock: 20,
    physical_stock: 20,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Chocobar Ice Cream'
  },
  {
    id: 'yuki_cone_chocolate_120_ml',
    name: 'YuKi Cone Chocolate - 120 ML',
    reference_name: 'YUKI CONE CHOCOLATE 120ML',
    variant: '120 ML Cone',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 16,
    expected_stock: 16,
    physical_stock: 16,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Cone Chocolate 120 ML Ice Cream'
  },
  {
    id: 'yuki_cone_vanilla_120_ml',
    name: 'YuKi Cone Vanilla - 120 ML',
    reference_name: 'YUKI CONE VANILLA 120ML',
    variant: '120 ML Cone',
    category: 'Ice Cream',
    price: 40,
    selling_price: 40,
    purchase_price: 31.20,
    stock: 16,
    expected_stock: 16,
    physical_stock: 16,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Cone Vanilla 120 ML Ice Cream'
  },
  {
    id: 'yuki_cone_butterscotch_120_ml',
    name: 'YuKi Cone Butterscotch - 120 ML',
    reference_name: 'YUKI CONE BUTTERSCOTCH 120ML',
    variant: '120 ML Cone',
    category: 'Ice Cream',
    price: 40,
    selling_price: 40,
    purchase_price: 31.20,
    stock: 16,
    expected_stock: 16,
    physical_stock: 16,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Cone Butterscotch 120 ML Ice Cream'
  },
  {
    id: 'yuki_small_cone_lavender_blackcurrant_70_ml',
    name: 'YuKi Small Cone Lavender Blackcurrant - 70 ML',
    reference_name: 'YUKI SMALL CONE LAVENDER BLACKCURRANT 70ML',
    variant: '70 ML Small Cone',
    category: 'Ice Cream',
    price: 30,
    selling_price: 30,
    purchase_price: 23.40,
    stock: 20,
    expected_stock: 20,
    physical_stock: 20,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Small Cone Lavender Blackcurrant 70 ML Ice Cream'
  },
  {
    id: 'yuki_sundae_mango_vanilla',
    name: 'YuKi Sundae Mango Vanilla',
    reference_name: 'YUKI SUNDAE MANGO VANILLA',
    variant: 'Sundae Cup',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Sundae Mango Vanilla Ice Cream'
  },
  {
    id: 'yuki_sundae_strawberry',
    name: 'YuKi Sundae Strawberry',
    reference_name: 'YUKI SUNDAE STRAWBERRY',
    variant: 'Sundae Cup',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Sundae Strawberry Ice Cream'
  },
  {
    id: 'yuki_mini_cone_strawberry_45_ml',
    name: 'YuKi Mini Cone Strawberry - 45 ML',
    reference_name: 'YUKI MINI CONE STRAWBERRY 45ML',
    variant: '45 ML Mini Cone',
    category: 'Ice Cream',
    price: 20,
    selling_price: 20,
    purchase_price: 15.60,
    stock: 20,
    expected_stock: 20,
    physical_stock: 20,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Cone Strawberry 45 ML Ice Cream'
  },
  {
    id: 'yuki_mini_cone_vanilla_45_ml',
    name: 'YuKi Mini Cone Vanilla - 45 ML',
    reference_name: 'YUKI MINI CONE VANILLA 45ML',
    variant: '45 ML Mini Cone',
    category: 'Ice Cream',
    price: 20,
    selling_price: 20,
    purchase_price: 15.60,
    stock: 20,
    expected_stock: 20,
    physical_stock: 20,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Cone Vanilla 45 ML Ice Cream'
  },
  {
    id: 'yuki_mini_tub_mango_sticky_rice',
    name: 'YuKi Mini Tub Mango Sticky Rice',
    reference_name: 'YUKI MINI TUB MANGO STICKY RICE',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 18,
    expected_stock: 18,
    physical_stock: 18,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Mango Sticky Rice Ice Cream'
  },
  {
    id: 'yuki_mini_tub_marutto_chocolate_malt',
    name: 'YuKi Mini Tub Marutto Chocolate & Malt',
    reference_name: 'YUKI MINI TUB MARUTTO CHOCOLATE & MALT',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Marutto Chocolate & Malt Ice Cream'
  },
  {
    id: 'yuki_mini_tub_matcha_strawberry',
    name: 'YuKi Mini Tub Matcha Strawberry',
    reference_name: 'YUKI MINI TUB MATCHA STRAWBERRY',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Matcha Strawberry Ice Cream'
  },
  {
    id: 'yuki_mini_tub_nutella_with_choco_ripple',
    name: 'YuKi Mini Tub Nutella with Choco Ripple',
    reference_name: 'YUKI MINI TUB NUTELLA WITH CHOCO RIPPLE',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Nutella with Choco Ripple Ice Cream'
  },
  {
    id: 'yuki_mini_tub_spanish_delight',
    name: 'YuKi Mini Tub Spanish Delight',
    reference_name: 'YUKI MINI TUB SPANISH DELIGHT',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Spanish Delight Ice Cream'
  },
  {
    id: 'yuki_mini_tub_tender_coconut',
    name: 'YuKi Mini Tub Tender Coconut',
    reference_name: 'YUKI MINI TUB TENDER COCONUT',
    variant: 'Mini Tub',
    category: 'Ice Cream',
    price: 50,
    selling_price: 50,
    purchase_price: 39.00,
    stock: 6,
    expected_stock: 6,
    physical_stock: 6,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Mini Tub Tender Coconut Ice Cream'
  },
  {
    id: 'yuki_milk_sip_up_lolly_mango',
    name: 'YuKi Milk Sip Up Lolly Mango',
    reference_name: 'YUKI MILK SIP UP LOLLY MANGO',
    variant: 'Milk Sip Up Lolly',
    category: 'Ice Cream',
    price: 10,
    selling_price: 10,
    purchase_price: 7.80,
    stock: 12,
    expected_stock: 12,
    physical_stock: 12,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Milk Sip Up Lolly Mango Ice Cream'
  },
  {
    id: 'yuki_milk_sip_up_lolly_pistachio',
    name: 'YuKi Milk Sip Up Lolly Pistachio',
    reference_name: 'YUKI MILK SIP UP LOLLY PISTACHIO',
    variant: 'Milk Sip Up Lolly',
    category: 'Ice Cream',
    price: 10,
    selling_price: 10,
    purchase_price: 7.80,
    stock: 12,
    expected_stock: 12,
    physical_stock: 12,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Milk Sip Up Lolly Pistachio Ice Cream'
  },
  {
    id: 'yuki_milk_sip_up_lolly_strawberry',
    name: 'YuKi Milk Sip Up Lolly Strawberry',
    reference_name: 'YUKI MILK SIP UP LOLLY STRAWBERRY',
    variant: 'Milk Sip Up Lolly',
    category: 'Ice Cream',
    price: 10,
    selling_price: 10,
    purchase_price: 7.80,
    stock: 12,
    expected_stock: 12,
    physical_stock: 12,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Milk Sip Up Lolly Strawberry Ice Cream'
  },
  {
    id: 'yuki_small_cone_chocolate_70_ml',
    name: 'YuKi Small Cone Chocolate - 70 ML',
    reference_name: 'YUKI SMALL CONE CHOCOLATE 70ML',
    variant: '70 ML Small Cone',
    category: 'Ice Cream',
    price: 30,
    selling_price: 30,
    purchase_price: 23.40,
    stock: 20,
    expected_stock: 20,
    physical_stock: 20,
    low_stock_threshold: 5,
    image_url: null,
    storage_path: null,
    is_active: true,
    is_available: true,
    description: 'YuKi Small Cone Chocolate 70 ML Ice Cream'
  }
];

async function seedIceCreams() {
  console.log('========================================================');
  console.log(' SEEDING 27 ICE CREAM PRODUCTS (UNITED ICE CREAMS)');
  console.log('========================================================\n');

  // 1. Math Verification
  const totalPieces = ICE_CREAM_PRODUCTS.reduce((s, p) => s + p.stock, 0);
  const totalCost = ICE_CREAM_PRODUCTS.reduce((s, p) => s + (p.purchase_price * p.stock), 0);
  const totalRevenue = ICE_CREAM_PRODUCTS.reduce((s, p) => s + (p.selling_price * p.stock), 0);
  const totalProfit = totalRevenue - totalCost;

  console.log(`[VERIFICATION 1] Total Products: ${ICE_CREAM_PRODUCTS.length} (Expected: 27)`);
  console.log(`[VERIFICATION 2] Total Pieces: ${totalPieces} (Expected: 497)`);
  console.log(`[VERIFICATION 3] Total Purchase Cost: ₹${totalCost.toFixed(2)} (Expected: ₹11,832.60)`);
  console.log(`[VERIFICATION 4] Total Potential Revenue: ₹${totalRevenue.toFixed(2)} (Expected: ₹15,170.00)`);
  console.log(`[VERIFICATION 5] Theoretical Gross Profit: ₹${totalProfit.toFixed(2)} (Expected: ₹3,337.40)`);

  if (ICE_CREAM_PRODUCTS.length !== 27 || totalPieces !== 497 || Math.abs(totalCost - 11832.60) > 0.01 || totalRevenue !== 15170 || Math.abs(totalProfit - 3337.40) > 0.01) {
    throw new Error('Mathematical verification failed! Halting execution.');
  }
  console.log('✓ All 5 mathematical checks passed identically.\n');

  // 2. Insert / Upsert into Supabase PostgreSQL
  console.log('Connecting to Supabase PostgreSQL...');
  let supabaseSuccess = 0;
  let supabaseErrors = 0;

  for (const item of ICE_CREAM_PRODUCTS) {
    try {
      const now = new Date().toISOString();
      const payload = {
        id: item.id,
        name: item.name,
        reference_name: item.reference_name,
        variant: item.variant,
        category: item.category,
        price: item.price,
        selling_price: item.selling_price,
        purchase_price: item.purchase_price,
        stock: item.stock,
        expected_stock: item.expected_stock,
        physical_stock: item.physical_stock,
        low_stock_threshold: item.low_stock_threshold,
        image_url: null,
        storage_path: null,
        is_active: item.is_active,
        is_available: item.is_available,
        description: item.description,
        updated_at: now
      };

      await serverSupabase.fetchApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: payload
      });

      supabaseSuccess++;
      console.log(`  [Supabase ✓] ${item.name} (${item.stock} pcs @ MRP ₹${item.price}, Cost ₹${item.purchase_price})`);
    } catch (err) {
      supabaseErrors++;
      console.error(`  [Supabase ✗] Error inserting ${item.name}:`, err.message);
    }
  }

  console.log(`\nSupabase Upsert Complete: ${supabaseSuccess} succeeded, ${supabaseErrors} errors.`);

  // 3. Update local fallback data (data/db-fallback.json)
  console.log('\nUpdating local fallback database (data/db-fallback.json)...');
  const fallbackPath = path.join(__dirname, '..', 'data', 'db-fallback.json');
  let fallbackDb = { products: [] };
  if (fs.existsSync(fallbackPath)) {
    try {
      fallbackDb = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    } catch (e) {}
  }

  if (!Array.isArray(fallbackDb.products)) {
    fallbackDb.products = [];
  }

  for (const item of ICE_CREAM_PRODUCTS) {
    const idx = fallbackDb.products.findIndex(p => p.id === item.id);
    const now = new Date().toISOString();
    const fallbackRecord = {
      ...item,
      created_at: now,
      updated_at: now
    };
    if (idx >= 0) {
      fallbackDb.products[idx] = { ...fallbackDb.products[idx], ...fallbackRecord };
    } else {
      fallbackDb.products.push(fallbackRecord);
    }
  }

  fs.writeFileSync(fallbackPath, JSON.stringify(fallbackDb, null, 2), 'utf8');
  console.log(`✓ Local fallback updated with all 27 ice cream products. (Total products now: ${fallbackDb.products.length})`);

  // 4. Verify in Supabase
  console.log('\nQuerying Supabase to verify live product counts...');
  const remoteProds = await serverSupabase.getProducts(true);
  const iceCreamsRemote = (remoteProds || []).filter(p => (p.category || '').toLowerCase() === 'ice cream');
  console.log(`Live Ice Cream products in Supabase: ${iceCreamsRemote.length}`);

  const livePieces = iceCreamsRemote.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  console.log(`Live Ice Cream opening stock: ${livePieces} pieces (Target: 497)`);

  console.log('\n========================================================');
  console.log(' SEEDING COMPLETE');
  console.log('========================================================');
}

seedIceCreams().catch(e => {
  console.error('\nFATAL ERROR DURING SEEDING:', e);
  process.exit(1);
});

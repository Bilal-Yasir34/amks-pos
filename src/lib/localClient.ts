// Local fallback client that provides in-memory and localStorage persistence
// when Supabase environment variables are not yet configured.

interface StoreData {
  products: any[];
  sales: any[];
  sale_items: any[];
  inventory_movements: any[];
  settings: any[];
}

const STORAGE_KEY = 'amks_pos_local_db_v1';

const DEFAULT_PRODUCTS = [
  {
    id: 'prod-0001',
    article_name: 'Cotton Shirt',
    product_code: '0001',
    barcode: '200000000001',
    colour: 'Black',
    quantity: 20,
    normal_price: 3500.0,
    sale_price: 2999.0,
    brand_name: 'AMKS',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-0002',
    article_name: 'Cotton Shirt',
    product_code: '0002',
    barcode: '200000000002',
    colour: 'White',
    quantity: 15,
    normal_price: 3500.0,
    sale_price: 2999.0,
    brand_name: 'AMKS',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-0003',
    article_name: 'Mens Jacket',
    product_code: '0003',
    barcode: '200000000003',
    colour: 'Navy',
    quantity: 10,
    normal_price: 7500.0,
    sale_price: 6999.0,
    brand_name: 'AMKS',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'prod-0004',
    article_name: 'Slim Fit Denim Jeans',
    product_code: '0004',
    barcode: '200000000004',
    colour: 'Indigo Blue',
    quantity: 18,
    normal_price: 4500.0,
    sale_price: 3999.0,
    brand_name: 'AMKS',
    active: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEFAULT_SETTINGS = [
  {
    id: 'settings-default',
    business_name: 'AMKS',
    company_name: 'AMKAS International',
    invoice_footer: 'AMKS by AMKAS International',
    low_stock_threshold: 5,
    currency_symbol: 'Rs.',
    invoice_counter: 0,
  },
];

function getStore(): StoreData {
  if (typeof window === 'undefined') {
    return {
      products: [...DEFAULT_PRODUCTS],
      sales: [],
      sale_items: [],
      inventory_movements: [],
      settings: [...DEFAULT_SETTINGS],
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        products: parsed.products || [...DEFAULT_PRODUCTS],
        sales: parsed.sales || [],
        sale_items: parsed.sale_items || [],
        inventory_movements: parsed.inventory_movements || [],
        settings: parsed.settings || [...DEFAULT_SETTINGS],
      };
    }
  } catch {
    // ignore
  }

  const initial: StoreData = {
    products: [...DEFAULT_PRODUCTS],
    sales: [],
    sale_items: [],
    inventory_movements: [],
    settings: [...DEFAULT_SETTINGS],
  };
  saveStore(initial);
  return initial;
}

function saveStore(data: StoreData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

class LocalQueryBuilder implements PromiseLike<any> {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private insertData: any = null;
  private updateData: any = null;
  private filters: Array<(item: any) => boolean> = [];
  private orderConfig: { col: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_columns = '*') {
    return this;
  }

  insert(data: any) {
    this.action = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((item) => item[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((item) => item[col] !== val);
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((item) => item[col] >= val);
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push((item) => item[col] <= val);
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((item) => item[col] < val);
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push((item) => item[col] > val);
    return this;
  }

  in(col: string, values: any[]) {
    this.filters.push((item) => values.includes(item[col]));
    return this;
  }

  or(filterStr: string) {
    // Parses expressions like "article_name.ilike.%search%,product_code.ilike.%search%"
    const conditions = filterStr.split(',').map((part) => {
      const match = part.match(/^([^.]+)\.ilike\.%(.*)%$/);
      if (match) {
        const [, col, search] = match;
        return { col, search: search.toLowerCase() };
      }
      return null;
    }).filter(Boolean) as Array<{ col: string; search: string }>;

    if (conditions.length > 0) {
      this.filters.push((item) =>
        conditions.some(({ col, search }) =>
          String(item[col] ?? '').toLowerCase().includes(search)
        )
      );
    }
    return this;
  }

  order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.orderConfig = { col, ascending };
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  private execute(): { data: any; error: any } {
    const store = getStore();
    const table: any[] = (store as any)[this.tableName] || [];

    if (this.action === 'insert') {
      const recordsToInsert = Array.isArray(this.insertData)
        ? this.insertData
        : [this.insertData];

      const createdRecords = recordsToInsert.map((rec) => ({
        id: rec.id || `local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        created_at: rec.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...rec,
      }));

      (store as any)[this.tableName] = [...table, ...createdRecords];
      saveStore(store);

      const result = Array.isArray(this.insertData)
        ? createdRecords
        : this.isSingle || this.isMaybeSingle
        ? createdRecords[0]
        : createdRecords[0];

      return { data: result, error: null };
    }

    if (this.action === 'update') {
      let updatedItems: any[] = [];
      (store as any)[this.tableName] = table.map((item) => {
        const matches = this.filters.every((fn) => fn(item));
        if (matches) {
          const updated = { ...item, ...this.updateData, updated_at: new Date().toISOString() };
          updatedItems.push(updated);
          return updated;
        }
        return item;
      });
      saveStore(store);

      const result = this.isSingle || this.isMaybeSingle
        ? updatedItems[0] || null
        : updatedItems;

      return { data: result, error: null };
    }

    if (this.action === 'delete') {
      (store as any)[this.tableName] = table.filter(
        (item) => !this.filters.every((fn) => fn(item))
      );
      saveStore(store);
      return { data: null, error: null };
    }

    // Default: select
    let result = table.filter((item) => this.filters.every((fn) => fn(item)));

    if (this.orderConfig) {
      const { col, ascending } = this.orderConfig;
      result.sort((a, b) => {
        if (a[col] < b[col]) return ascending ? -1 : 1;
        if (a[col] > b[col]) return ascending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }

    if (this.isSingle) {
      return {
        data: result[0] || null,
        error: result.length === 0 ? new Error('Row not found') : null,
      };
    }

    if (this.isMaybeSingle) {
      return {
        data: result[0] || null,
        error: null,
      };
    }

    return { data: result, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const outcome = this.execute();
    return Promise.resolve(outcome).then(onfulfilled, onrejected);
  }
}

export function createLocalClient() {
  return {
    from(tableName: string) {
      return new LocalQueryBuilder(tableName);
    },
  };
}

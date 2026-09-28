import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {orders, products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export type OrderWithProducts = {
	id: number;
	products: Array<{
		product: Product;
	}>;
};

export class ProductRepository {
	private readonly db: Database;

	public constructor({db}: Pick<Cradle, 'db'>) {
		this.db = db;
	}

	public async updateProduct(product: Product): Promise<void> {
		await this.db.update(products).set(product).where(eq(products.id, product.id));
	}

	public async getOrderWithProducts(orderId: number): Promise<OrderWithProducts | undefined> {
		return this.db.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {
				products: {
					columns: {},
					with: {
						product: true,
					},
				},
			},
		});
	}
}

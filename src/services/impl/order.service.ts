import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {ProductService} from './product.service.js';
import {orders, products} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class OrderService {
	private readonly ps: ProductService;
	private readonly db: Database;

	public constructor({ps, db}: Pick<Cradle, 'ps' | 'db'>) {
		this.ps = ps;
		this.db = db;
	}

	public async processOrder(orderId: number): Promise<void> {
		const order = (await this.db.query.orders
			.findFirst({
				where: eq(orders.id, orderId),
				with: {
					products: {
						columns: {},
						with: {
							product: true,
						},
					},
				},
			}))!;

		const {products: productList} = order;

		if (productList) {
			for (const {product: p} of productList) {
				switch (p.type) {
					case 'NORMAL': {
						if (p.available > 0) {
							p.available -= 1;
							await this.db.update(products).set(p).where(eq(products.id, p.id));
						} else {
							const {leadTime} = p;
							if (leadTime > 0) {
								await this.ps.notifyDelay(leadTime, p);
							}
						}

						break;
					}

					case 'SEASONAL': {
						const currentDate = new Date();
						if (currentDate > p.seasonStartDate! && currentDate < p.seasonEndDate! && p.available > 0) {
							p.available -= 1;
							await this.db.update(products).set(p).where(eq(products.id, p.id));
						} else {
							await this.ps.handleSeasonalProduct(p);
						}

						break;
					}

					case 'EXPIRABLE': {
						const currentDate = new Date();
						if (p.available > 0 && p.expiryDate! > currentDate) {
							p.available -= 1;
							await this.db.update(products).set(p).where(eq(products.id, p.id));
						} else {
							await this.ps.handleExpiredProduct(p);
						}

						break;
					}
				}
			}
		}
	}
}

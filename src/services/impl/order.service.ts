import {type Cradle} from '@fastify/awilix';
import {ProductService} from './product.service.js';
import {ProductRepository} from '@/repositories/product.repository.js';

export class OrderService {
	private readonly ps: ProductService;
	private readonly pr: ProductRepository;

	public constructor({ps, pr}: Pick<Cradle, 'ps' | 'pr'>) {
		this.ps = ps;
		this.pr = pr;
	}

	public async processOrder(orderId: number): Promise<void> {
		const order = (await this.pr.getOrderWithProducts(orderId))!;

		const {products: productList} = order;

		if (productList) {
			for (const {product: p} of productList) {
				switch (p.type) {
					case 'NORMAL': {
						if (p.available > 0) {
							p.available -= 1;
							await this.pr.updateProduct(p);
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
							await this.pr.updateProduct(p);
						} else {
							await this.ps.handleSeasonalProduct(p);
						}

						break;
					}

					case 'EXPIRABLE': {
						const currentDate = new Date();
						if (p.available > 0 && p.expiryDate! > currentDate) {
							p.available -= 1;
							await this.pr.updateProduct(p);
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

import {type Cradle} from '@fastify/awilix';
import {ProductService} from './product.service.js';
import {ProductRepository} from '@/repositories/product.repository.js';
import {type Product} from '@/db/schema.js';

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
			for (const {product} of productList) {
				switch (product.type) {
					case 'NORMAL': {
						await this.processNormalProduct(product);
						break;
					}

					case 'SEASONAL': {
						await this.processSeasonalProduct(product);
						break;
					}

					case 'EXPIRABLE': {
						await this.processExpirableProduct(product);
						break;
					}
				}
			}
		}
	}

	private async processNormalProduct(product: Product): Promise<void> {
		if (product.available > 0) {
			product.available -= 1;
			await this.pr.updateProduct(product);
		} else {
			const {leadTime} = product;
			if (leadTime > 0) {
				await this.ps.notifyDelay(leadTime, product);
			}
		}
	}

	private async processSeasonalProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		if (currentDate > product.seasonStartDate! && currentDate < product.seasonEndDate! && product.available > 0) {
			product.available -= 1;
			await this.pr.updateProduct(product);
		} else {
			await this.ps.handleSeasonalProduct(product);
		}
	}

	private async processExpirableProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		if (product.available > 0 && product.expiryDate! > currentDate) {
			product.available -= 1;
			await this.pr.updateProduct(product);
		} else {
			await this.ps.handleExpiredProduct(product);
		}
	}
}

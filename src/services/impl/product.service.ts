import {type Cradle} from '@fastify/awilix';
import {type INotificationService} from '../notifications.port.js';
import {type Product} from '@/db/schema.js';
import {ProductRepository} from '@/repositories/product.repository.js';

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export class ProductService {
	private readonly ns: INotificationService;
	private readonly pr: ProductRepository;

	public constructor({ns, pr}: Pick<Cradle, 'ns' | 'pr'>) {
		this.ns = ns;
		this.pr = pr;
	}

	public async notifyDelay(leadTime: number, product: Product): Promise<void> {
		product.leadTime = leadTime;
		await this.pr.updateProduct(product);
		this.ns.sendDelayNotification(leadTime, product.name);
	}

	public async handleSeasonalProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		if (new Date(currentDate.getTime() + (product.leadTime * MILLISECONDS_PER_DAY)) > product.seasonEndDate!) {
			this.ns.sendOutOfStockNotification(product.name);
			product.available = 0;
			await this.pr.updateProduct(product);
		} else if (product.seasonStartDate! > currentDate) {
			this.ns.sendOutOfStockNotification(product.name);
			await this.pr.updateProduct(product);
		} else {
			await this.notifyDelay(product.leadTime, product);
		}
	}

	public async handleExpiredProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		if (product.available > 0 && product.expiryDate! > currentDate) {
			product.available -= 1;
			await this.pr.updateProduct(product);
		} else {
			this.ns.sendExpirationNotification(product.name, product.expiryDate!);
			product.available = 0;
			await this.pr.updateProduct(product);
		}
	}
}

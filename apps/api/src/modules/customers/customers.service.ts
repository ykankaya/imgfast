import { Injectable, NotFoundException } from '@nestjs/common';

export interface Customer {
  id: string;
  email: string;
  publicKey: string;
  secretKeyHash: string;
  plan: {
    id: string;
    name: string;
    tier: 'free' | 'starter' | 'pro' | 'enterprise';
  };
  status: 'active' | 'suspended' | 'cancelled';
  allowedDomains: string[];
  allowedReferrers: string[];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CustomersService {
  // In production, this would use a database (PostgreSQL, etc.)
  private customers: Map<string, Customer> = new Map();

  async findById(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  async findByPublicKey(publicKey: string): Promise<Customer | null> {
    for (const customer of this.customers.values()) {
      if (customer.publicKey === publicKey) {
        return customer;
      }
    }
    return null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    for (const customer of this.customers.values()) {
      if (customer.email === email) {
        return customer;
      }
    }
    return null;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    for (const customer of this.customers.values()) {
      if (customer.stripeCustomerId === stripeCustomerId) {
        return customer;
      }
    }
    return null;
  }

  async create(data: Partial<Customer>): Promise<Customer> {
    const customer: Customer = {
      id: `cust_${Date.now()}`,
      email: data.email!,
      publicKey: data.publicKey!,
      secretKeyHash: data.secretKeyHash!,
      plan: data.plan || { id: 'free', name: 'Free', tier: 'free' },
      status: 'active',
      allowedDomains: data.allowedDomains || [],
      allowedReferrers: data.allowedReferrers || [],
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.customers.set(customer.id, customer);
    return customer;
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer> {
    const customer = await this.findById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = {
      ...customer,
      ...data,
      updatedAt: new Date(),
    };

    this.customers.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: Customer['status']): Promise<Customer> {
    return this.update(id, { status });
  }

  async updatePlan(id: string, plan: Customer['plan']): Promise<Customer> {
    return this.update(id, { plan });
  }
}

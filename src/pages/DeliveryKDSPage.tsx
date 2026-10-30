import React from 'react';
import { DeliveryLayout } from '@/domains/delivery/components/DeliveryLayout';
import { KDSOrderBoard } from '@/domains/delivery/components/KDSOrderBoard';
import { DeliveryRoleGuard } from '@/domains/delivery/DeliveryRoleGuard';

export const DeliveryKDSPage: React.FC = () => {
  return (
    <DeliveryRoleGuard>
      <DeliveryLayout>
        <KDSOrderBoard />
      </DeliveryLayout>
    </DeliveryRoleGuard>
  );
};

export default DeliveryKDSPage;

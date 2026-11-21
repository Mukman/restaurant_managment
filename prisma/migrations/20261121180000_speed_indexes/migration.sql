-- Speed-up indexes for the screens used all day (POS, dashboard, orders, reports, shifts).
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");
CREATE INDEX "Product_tenantId_active_idx" ON "Product"("tenantId", "active");
CREATE INDEX "StockLevel_branchId_idx" ON "StockLevel"("branchId");
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX "Order_tenantId_branchId_status_closedAt_idx" ON "Order"("tenantId", "branchId", "status", "closedAt");
CREATE INDEX "Order_shiftId_idx" ON "Order"("shiftId");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Shift_tenantId_branchId_status_idx" ON "Shift"("tenantId", "branchId", "status");
CREATE INDEX "Shift_userId_status_idx" ON "Shift"("userId", "status");

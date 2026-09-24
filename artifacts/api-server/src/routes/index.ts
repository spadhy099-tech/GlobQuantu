import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vaultoraRouter from "./vaultora";
import complianceRouter from "./compliance";
import statementsRouter from "./statements";
import tradingRouter from "./trading";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vaultoraRouter);
router.use(complianceRouter);
router.use(statementsRouter);
router.use(tradingRouter);

export default router;

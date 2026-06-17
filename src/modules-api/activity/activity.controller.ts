import { Controller, Get, Req } from "@nestjs/common";
import { ActivityService } from "./activity.service";

@Controller('activity')
export class ActivityController {
    constructor (private readonly activityService: ActivityService) {}
    @Get()
    async getActivityLogs(@Req() req) {
        return await this.activityService.getActivityLogs();
    }
}
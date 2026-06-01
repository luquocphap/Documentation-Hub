import { Module } from "@nestjs/common";
import { TokenService } from "./token.service";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
    providers: [TokenService],
    exports: [TokenService],
})
export class TokenModule {}
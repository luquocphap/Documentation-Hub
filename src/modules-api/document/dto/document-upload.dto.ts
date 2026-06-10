import { ApiProperty } from "@nestjs/swagger";

export class DocumentUploadDto {
    @ApiProperty({ type: "string", format: "binary", description: "Chọn file để upload" })
    document_file: any
}
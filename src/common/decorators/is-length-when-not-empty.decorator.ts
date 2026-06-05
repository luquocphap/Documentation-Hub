import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsLengthWhenNotEmpty(
  min: number,
  max?: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLengthWhenNotEmpty',
      target: object.constructor,
      propertyName,
      constraints: [min, max],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') {
            return true;
          }

          return (
            typeof value === 'string' &&
            value.length >= min &&
            (max === undefined || value.length <= max)
          );
        },
      },
    });
  };
}

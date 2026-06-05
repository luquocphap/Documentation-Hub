import {
  isEmail,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsEmailWhenNotEmpty(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEmailWhenNotEmpty',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') {
            return true;
          }

          return typeof value === 'string' && isEmail(value);
        },
      },
    });
  };
}

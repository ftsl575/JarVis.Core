const fixedTime = new Date("2024-01-01T00:00:00.000Z");
const RealDate = Date;

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixedTime.getTime());
      return;
    }
    super(...args);
  }

  static now() {
    return fixedTime.getTime();
  }
}

global.Date = FixedDate;

const { checkPassesRequired, createNewReservationsObj } = require('../reservationLayer/reservationLayer');

function mockFacility(paramState, paramBookingDays, paramBookableHolidays = []) {
  return {
    pk: 'facility::Test Park',
    sk: 'Test Facility',
    name: 'Test Facility',
    description: 'A Parking Lot!',
    isUpdating: false,
    type: 'Parking',
    bookingTimes: {
      AM: { max: '100' },
      PM: { max: '100' },
      DAY: { max: '100' }
    },
    bookingDays: paramBookingDays,
    bookingDaysRichText: '',
    bookableHolidays: paramBookableHolidays,
    status: { stateReason: '', state: paramState },
    qrcode: true,
    visible: true
  };
}

describe('checkPassesRequired', () => {
  const bookingDays = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: false };
  const bookableHolidays = ['2025-04-20'];
  const facility = mockFacility('open', bookingDays, bookableHolidays);

  test('should return true when a facility requires passes (normal weekday)', () => {
    expect(checkPassesRequired(facility, '2025-04-29')).toBeTruthy(); // Tuesday
  });

  test("should return false when passes aren't required (Sunday)", () => {
    expect(checkPassesRequired(facility, '2025-04-27')).toBeFalsy(); // Sunday
  });

  test('should return true on a bookable holiday (even if not in bookingDays)', () => {
    expect(checkPassesRequired(facility, '2025-04-20')).toBeTruthy(); // Easter Sunday
  });
});

// --- Base Layer Mocks ---

let baseLayerMockConfig = {
  parkState: 'open',
  marshallCaptureRef: null
};

jest.mock('/opt/baseLayer', () => ({
  getOne: jest.fn(() =>
    Promise.resolve({
      status: baseLayerMockConfig.parkState
    })
  ),
  PutItemCommand: jest.fn(obj => obj),
  marshall: jest.fn(obj => {
    if (baseLayerMockConfig.marshallCaptureRef) {
      baseLayerMockConfig.marshallCaptureRef.obj = obj;
    }
    return obj;
  }),
  unmarshall: jest.fn(obj => obj),
  dynamoClient: {
    send: jest.fn(obj => Promise.resolve({ success: true }))
  },
  logger: {
    info: jest.fn(),
    debug: jest.fn()
  }
}));

// --- Helper for createNewReservationsObj test ---

async function runCreateTest({
  parkState,
  facilityState,
  bookingDays,
  date,
  expectedPassesRequired,
  expectedCapacities
}) {
  const capture = {};
  baseLayerMockConfig.parkState = parkState;
  baseLayerMockConfig.marshallCaptureRef = capture;
  const facility = mockFacility(facilityState, bookingDays);
  await createNewReservationsObj(facility, 'reservations::1234::Test Lake', date);

  expect(capture.obj.passesRequired).toBe(expectedPassesRequired);
  expect(capture.obj.capacities.AM.baseCapacity).toBe(expectedCapacities);
  expect(capture.obj.capacities.PM.baseCapacity).toBe(expectedCapacities);
  expect(capture.obj.capacities.DAY.baseCapacity).toBe(expectedCapacities);
}

describe('createNewReservationsObj', () => {
  const allDays = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true };
  const noDays = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false };
  const testDate = '2025-04-27'; // A Sunday, or the 7th day in the objects

  test('Park open, facility open, passes required', async () => {
    await runCreateTest({
      parkState: 'open',
      facilityState: 'open',
      bookingDays: allDays,
      date: testDate,
      expectedPassesRequired: true,
      expectedCapacities: '100'
    });
  });

  test('Park open, facility open, passes NOT required', async () => {
    await runCreateTest({
      parkState: 'open',
      facilityState: 'open',
      bookingDays: noDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park open, facility closed, passes required', async () => {
    await runCreateTest({
      parkState: 'open',
      facilityState: 'closed',
      bookingDays: allDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park open, facility closed, passes NOT required', async () => {
    await runCreateTest({
      parkState: 'open',
      facilityState: 'closed',
      bookingDays: noDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park closed, facility open, passes required', async () => {
    await runCreateTest({
      parkState: 'closed',
      facilityState: 'open',
      bookingDays: allDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park closed, facility open, passes NOT required', async () => {
    await runCreateTest({
      parkState: 'closed',
      facilityState: 'open',
      bookingDays: noDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park closed, facility closed, passes required', async () => {
    await runCreateTest({
      parkState: 'closed',
      facilityState: 'closed',
      bookingDays: allDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });

  test('Park closed, facility closed, passes NOT required', async () => {
    await runCreateTest({
      parkState: 'closed',
      facilityState: 'closed',
      bookingDays: noDays,
      date: testDate,
      expectedPassesRequired: false,
      expectedCapacities: 0
    });
  });
});

const { checkPassesRequired } = require('../reservationLayer/reservationLayer');

const mockFacility = {
  pk: 'facility::Test Park',
  sk: 'Test Facility',
  name: 'Test Facility',
  description: 'A Parking Lot!',
  isUpdating: false,
  type: 'Parking',
  bookingTimes: {
    AM: { max: '100' },
    PM: { max: '200' },
    DAY: { max: '300' }
  },
  bookingDays: {
    1: true,
    2: true, // Tuesday e.g. 2025-04-29
    3: true,
    4: true,
    5: true,
    6: true,
    7: false // Sunday e.g. 2025-04-27, 2025-04-20 (Easter)
  },
  bookingDaysRichText: '',
  bookableHolidays: ['2025-04-20'],
  status: { stateReason: '', state: 'open' },
  qrcode: true,
  visible: true
};

describe('checkPassesRequired', () => {
  let passesRequired = checkPassesRequired(mockFacility, '2025-04-29');
  test('should return true when a facility requires passes', () => {
    expect(passesRequired).toBeTruthy();
  });

  let passesNotRequired = checkPassesRequired(mockFacility, '2025-04-27');
  test("should return false when a facility doesn't require passes", () => {
    expect(passesNotRequired).toBeFalsy();
  });

  let bookableHoliday = checkPassesRequired(mockFacility, '2025-04-20');
  test('should return true when a facility requires passes on a holiday', () => {
    expect(bookableHoliday).toBeTruthy();
  });
});

let baseLayerMockConfig = {
  parkState: 'open',
  marshallCaptureRef: null
};

jest.mock('/opt/baseLayer', () => ({
  getOne: jest.fn(() =>
    Promise.resolve({
      status: {
        state: baseLayerMockConfig.parkState,
        stateReason: ''
      }
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

describe('createNewReservationsObj', () => {
  test("should show that passes are NOT required and capacities are 0 because the park is open and facility's booking day is set to false", async () => {
    const capture = {};
    baseLayerMockConfig.parkState = 'open';
    baseLayerMockConfig.marshallCaptureRef = capture;

    const { createNewReservationsObj } = require('../ReservationLayer/reservationLayer');
    await createNewReservationsObj(mockFacility, 'reservations::1234::Test Lake', '2025-04-27'); // Passes not required this day

    expect(capture.obj.passesRequired).toBe(false);
    expect(capture.obj.capacities.AM.baseCapacity).toBe(0);
    expect(capture.obj.capacities.PM.baseCapacity).toBe(0);
    expect(capture.obj.capacities.DAY.baseCapacity).toBe(0);
  });

  test("should show that passes are required and capacities are normal because the park is open and facility's booking day is set to true", async () => {
    const capture = {};
    baseLayerMockConfig.parkState = 'open';
    baseLayerMockConfig.marshallCaptureRef = capture;

    const { createNewReservationsObj } = require('../ReservationLayer/reservationLayer');
    await createNewReservationsObj(mockFacility, 'reservations::1234::Test Lake', '2025-04-29'); // Passes required this day
    expect(capture.obj.passesRequired).toBe(true);
    expect(capture.obj.capacities.AM.baseCapacity).toBe('100');
    expect(capture.obj.capacities.PM.baseCapacity).toBe('200');
    expect(capture.obj.capacities.DAY.baseCapacity).toBe('300');
  });

  test("should show that passes are NOT required and capacities are 0 because the PARK is CLOSED, regardless of facility's pass status", async () => {
    const capture = {};
    baseLayerMockConfig.parkState = 'closed'; // Park's status state is 'closed'
    baseLayerMockConfig.marshallCaptureRef = capture;
    
    const { createNewReservationsObj } = require('../ReservationLayer/reservationLayer');
    await createNewReservationsObj(mockFacility, 'reservations::1234::Test Lake', '2025-04-29'); // Passes required this day
    expect(capture.obj.passesRequired).toBe(false);
    expect(capture.obj.capacities.AM.baseCapacity).toBe(0);
    expect(capture.obj.capacities.PM.baseCapacity).toBe(0);
    expect(capture.obj.capacities.DAY.baseCapacity).toBe(0);
  });
});

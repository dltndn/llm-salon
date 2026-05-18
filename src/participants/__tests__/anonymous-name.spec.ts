import { anonymousNameForJoinOrder } from '../anonymous-name';

describe('anonymousNameForJoinOrder', () => {
  it('assigns sequential member names for the first 30 registrations', () => {
    const expectedNames = [
      'Member A',
      'Member B',
      'Member C',
      'Member D',
      'Member E',
      'Member F',
      'Member G',
      'Member H',
      'Member I',
      'Member J',
      'Member K',
      'Member L',
      'Member M',
      'Member N',
      'Member O',
      'Member P',
      'Member Q',
      'Member R',
      'Member S',
      'Member T',
      'Member U',
      'Member V',
      'Member W',
      'Member X',
      'Member Y',
      'Member Z',
      'Member AA',
      'Member AB',
      'Member AC',
      'Member AD',
    ];

    expect(
      Array.from({ length: 30 }, (_, index) =>
        anonymousNameForJoinOrder(index + 1),
      ),
    ).toEqual(expectedNames);
  });

  it('rejects invalid join orders', () => {
    expect(() => anonymousNameForJoinOrder(0)).toThrow(
      'joinOrder must be a positive integer',
    );
  });
});

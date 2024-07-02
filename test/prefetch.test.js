import * as Request from "../lib/request";
import { DecisionsCollection, UserModel } from "./model-mocks";

import Collection from "../lib/collection";
import prefetch from "../lib/prefetch";
import ReactDOM from "react-dom";
import { vi } from "vitest";

const renderNode = document.createElement("div");
const getResources = (props) => ({
  user: {
    params: { home: props.home, source: props.source },
    path: { userId: props.userId },
  },
  decisions: {},
});
const expectedProps = { userId: "noah", home: "sf", source: "hbase" };
const dummyEvt = { target: renderNode };

describe("prefetch", () => {
  beforeEach(() => {
    document.body.appendChild(renderNode);
    vi.spyOn(Request, "default").mockResolvedValue(new Collection([]));
    vi.useFakeTimers();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(renderNode);
    Request.default.mockRestore();
    renderNode.remove();
    vi.useRealTimers();
  });

  it("correctly turns the config object into cache key, params, and options", () => {
    var oldFields = UserModel.dependencies;

    UserModel.dependencies = ["userId", "source"];

    prefetch(getResources, expectedProps)(dummyEvt);
    vi.advanceTimersByTime(100);

    expect(Request.default.mock.calls[0][0]).toEqual("usersource=hbase_userId=noah");
    expect(Request.default.mock.calls[0][1]).toEqual(UserModel);
    expect(Request.default.mock.calls[0][2]).toEqual({
      path: { userId: "noah" },
      params: { home: "sf", source: "hbase" },
    });

    expect(Request.default.mock.calls[1][0]).toEqual("decisions");
    expect(Request.default.mock.calls[1][1]).toEqual(DecisionsCollection);
    expect(Request.default.mock.calls[1][2]).toEqual({});

    expect(() => prefetch(() => false)({})).not.toThrow();
    UserModel.dependencies = oldFields;
  });

  it("will fire if the user hovers over the element for longer than the timeout", () => {
    var leaveEvt = new Event("mouseleave");

    prefetch(getResources, expectedProps)(dummyEvt);
    vi.advanceTimersByTime(50);
    renderNode.dispatchEvent(leaveEvt);
    expect(Request.default).toHaveBeenCalled();
  });

  it("will not fetch if the user leaves the element before the timeout", () => {
    var leaveEvt = new Event("mouseleave");

    prefetch(getResources, expectedProps)(dummyEvt);
    vi.advanceTimersByTime(25);
    renderNode.dispatchEvent(leaveEvt);
    vi.advanceTimersByTime(25);
    expect(Request.default).not.toHaveBeenCalled();
  });
});

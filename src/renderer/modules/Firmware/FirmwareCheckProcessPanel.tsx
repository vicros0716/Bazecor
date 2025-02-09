// -*- mode: js-jsx -*-
/* Bazecor
 * Copyright (C) 2022  Dygmalab, Inc.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from "react";
import Styled from "styled-components";
import { useMachine } from "@xstate/react";
import { useDevice } from "@Renderer/DeviceContext";
import { i18n } from "@Renderer/i18n";

// State machine
import DeviceChecks from "@Renderer/controller/DeviceChecks/machine";
import { ContextType } from "@Renderer/controller/FlashManager/context";

// Visual components
import Title from "@Renderer/component/Title";
import Callout from "@Renderer/component/Callout";
import { RegularButton } from "@Renderer/component/Button";
import { FirmwareLoader } from "@Renderer/component/Loader";
import AccordionFirmware from "@Renderer/component/Accordion/AccordionFirmware";

import FirmwareNeuronStatus from "./FirmwareNeuronStatus";
import FirmwareWarningList from "./FirmwareWarningList";

const Style = Styled.div`
width: 100%;
height:inherit;
.firmware-wrapper {
  max-width: 960px;
  width: 100%;
  margin: auto;

  .firmware-row {
    width: 100%;
    display: flex;
    flex-wrap: nowrap;
  }
  .firmware-content {
    flex: 0 0 66%;
    background: ${({ theme }) => theme.styles.firmwareUpdatePanel.backgroundContent};
  }
  .firmware-sidebar {
    flex: 0 0 34%;
    background: ${({ theme }) => theme.styles.firmwareUpdatePanel.backgroundSidebar};
  }
  .firmware-content--inner {
    padding: 32px;
    letter-spacing: -0.01em;
    strong {
      font-weight: 601;
    }
  }

  .borderLeftTopRadius {
    border-top-left-radius: 14px;
  }
  .borderRightTopRadius {
    border-top-right-radius: 14px;
  }
  .borderLeftBottomRadius {
    border-bottom-left-radius: 14px;
  }
  .borderRightBottomRadius {
    border-bottom-right-radius: 14px;
  }
}

.buttonActions {
  position: relative;
  display: flex;
  height: 116px;
  margin-bottom: 42px;
  margin-right: 32px;
  background-color: ${({ theme }) => theme.styles.firmwareUpdatePanel.backgroundStripeColor};
  border-bottom-right-radius: 16px;
  border-top-right-radius: 16px;
  align-items:center;
  justify-content: center;
}
.dropdownCustomFirmware {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translate3d(0, -50%,0);
  margin-top: 0;
  z-index: 9;

  .buttonToggler.dropdown-toggle.btn {
    color: ${({ theme }) => theme.styles.firmwareUpdatePanel.iconDropdownColor};
  }
}
.wrapperActions {
  display: flex;
  padding-left: 32px;
  margin-left: 32px;
  align-items: center;
  height: 116px;
  margin-bottom: 42px;
  background-color: ${({ theme }) => theme.styles.firmwareUpdatePanel.backgroundStripeColor};
  border-bottom-left-radius: 16px;
  border-top-left-radius: 16px;
  overflow: hidden;
  .button {
    align-self: center;
  }
}
.disclaimer-firmware {
  .lineColor {
      stroke: ${({ theme }) => theme.styles.firmwareUpdatePanel.neuronStatusLineWarning};
  }
}
.buttonActions .button.outline,
.buttonActions .button.primary {
  margin-right: -32px;
}
@media screen and (max-width: 1100px) {
  .buttonActions .button.primary {
    margin-right: -16px;
  }
}
@media screen and (max-width: 980px) {
  .buttonActions .button.primary {
    margin-right: 6px;
  }
}
@media screen and (max-width: 860px) {
  .buttonActions .button.primary {
    margin-right: 16px;
  }
  .dropdownCustomFirmware {
    right: 8px;
  }
  .buttonActions {
    justify-content: flex-start;
    padding-left: 8px;
  }
  .firmware-wrapper .firmware-content {
    flex: 0 0 55%;
  }
  .firmware-wrapper .firmware-sidebar {
    flex: 0 0 45%;
  }
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 8px;
  }
  .hidden-on-sm {
    display:none;
  }
}
`;

interface FirmwareCheckProcessPanelType {
  nextBlock: (context: any) => void;
  retryBlock: (context: any) => void;
  context: ContextType;
}

type ListItems = { id: number; text: "sideLeftOk" | "sideLeftBL" | "sideRightOK" | "sideRightBL" | "backup"; checked: boolean };

function FirmwareCheckProcessPanel(props: FirmwareCheckProcessPanelType) {
  const { nextBlock, retryBlock, context } = props;
  const { state: deviceState } = useDevice();
  const [state, send] = useMachine(DeviceChecks, {
    input: { device: context.device, deviceState, firmwares: context.firmwares },
  });
  const [listItems, setlistItems] = useState<ListItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (state.context.stateblock > 4) {
      setLoading(false);
    }
    if (state.value === "success") nextBlock(state.context);
  }, [state.context, state, nextBlock]);

  useEffect(() => {
    const newValue: ListItems[] = ["sideLeftOk", "sideLeftBL", "sideRightOK", "sideRightBL", "backup"].map(
      (text: "sideLeftOk" | "sideLeftBL" | "sideRightOK" | "sideRightBL" | "backup", index) => {
        let checked = false;
        if (text === "backup") {
          checked = state.context.backup !== undefined;
          return { id: index, text, checked };
        }
        checked = text.includes("BL") ? !state.context[text] : state.context[text];
        // log.info(text, state.context, checked);
        return { id: index, text, checked };
      },
    );
    // console.log("Setting checks", newValue);
    setlistItems(newValue);
  }, [state]);

  return (
    <Style>
      {loading ? (
        <FirmwareLoader width={undefined} warning={undefined} error={undefined} paused={undefined} />
      ) : (
        <div>
          {state.context.device.info.product !== "Raise" ? (
            <div className="firmware-wrapper disclaimer-firmware">
              <div className="firmware-row">
                <div className="firmware-content borderLeftTopRadius">
                  <div className="firmware-content--inner">
                    <Title
                      text={
                        !state.context.sideLeftOk || !state.context.sideRightOK
                          ? i18n.firmwareUpdate.texts.errorTitle
                          : i18n.firmwareUpdate.texts.disclaimerTitle
                      }
                      headingLevel={3}
                      type={
                        (!state.context.sideLeftOk || !state.context.sideRightOK ? "warning" : "default") as "warning" | "default"
                      }
                    />
                    {state.context.sideLeftOk && state.context.sideRightOK ? (
                      <>
                        <div
                          className="disclaimerContent"
                          dangerouslySetInnerHTML={{ __html: i18n.firmwareUpdate.texts.disclaimerContent }}
                        />
                        <div
                          className="disclaimerContent"
                          dangerouslySetInnerHTML={{ __html: i18n.firmwareUpdate.texts.disclaimerContent3 }}
                        />
                        <Callout content={i18n.firmwareUpdate.texts.disclaimerContent2} size="sm" className="mt-lg" />
                      </>
                    ) : (
                      ""
                    )}
                    <FirmwareWarningList
                      leftSideOK={state.context.sideLeftOk}
                      rightSideOK={state.context.sideRightOK}
                      leftSideBL={state.context.sideLeftBL}
                    />
                    {state.context.device.info.product !== "Raise" ? <AccordionFirmware items={listItems} /> : ""}
                  </div>
                </div>
                <div className="firmware-sidebar borderRightTopRadius">
                  <FirmwareNeuronStatus
                    isUpdated={state.context.isUpdated as boolean}
                    status={!state.context.sideLeftOk || !state.context.sideRightOK ? "warning" : "waiting"}
                    deviceProduct={state.context.device.info.product}
                    keyboardType={state.context.device.info.keyboardType}
                    icon={undefined}
                  />
                </div>
              </div>
              <div className="firmware-row">
                <div className="firmware-content borderLeftBottomRadius">
                  <div className="wrapperActions">
                    <RegularButton
                      styles="outline transp-bg flashingbutton nooutlined"
                      buttonText={
                        !state.context.sideLeftOk || !state.context.sideRightOK
                          ? i18n.firmwareUpdate.texts.cancelButton
                          : i18n.firmwareUpdate.texts.backwds
                      }
                      onClick={() => {
                        send({ type: "cancel-event" });
                        retryBlock(state.context);
                      }}
                    />
                  </div>
                </div>
                <div className="firmware-sidebar borderRightBottomRadius">
                  <div className="buttonActions">
                    {state.context.sideLeftOk && state.context.sideRightOK && state.context.backup ? (
                      <RegularButton
                        styles="primary flashingbutton nooutlined"
                        buttonText={i18n.firmwareUpdate.texts.letsStart}
                        onClick={() => send({ type: "pressed-event" })}
                      />
                    ) : (
                      <RegularButton
                        styles="primary flashingbutton nooutlined"
                        buttonText={i18n.general.retry}
                        onClick={() => {
                          send({ type: "retry-event" });
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            ""
          )}
        </div>
      )}
    </Style>
  );
}

export default FirmwareCheckProcessPanel;

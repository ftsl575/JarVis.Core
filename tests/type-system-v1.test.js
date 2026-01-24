import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeviceType } from "../core/type-system/v1/index.js";

test("classifies device types with deterministic rules", () => {
  const cases = [
    {
      name: "Broadcom BCM57412 adapter",
      input: {
        description: "Broadcom BCM57412 Ethernet 10Gb 2-port SFP+ OCP3 Adapter for HPE",
      },
      expected: "Network Adapter",
    },
    {
      name: "HPE power supply kit",
      input: {
        description: "HPE 1000W Flex Slot Titanium Hot Plug Power Supply Kit",
      },
      expected: "PSU",
    },
    {
      name: "HPE power cord",
      input: {
        description: "HPE C13 - C14 250V 10Amp 2m FIO Power Cord",
      },
      expected: "Power Cord",
    },
    {
      name: "C13/C14 power cord",
      input: {
        description: "C13/C14 2m Power Cord",
      },
      expected: "Power Cord",
    },
    {
      name: "Factory integrated power cord remains unclear",
      input: {
        description: "Factory Integrated C13/C14 Power Cord",
      },
      expected: "Unclear",
    },
    {
      name: "HPE OneView software",
      input: {
        description: "HPE OneView for ProLiant DL Server LTU",
      },
      expected: "Software",
    },
    {
      name: "Compute cloud management enablement software",
      input: {
        description: "Compute Cloud Management Server FIO Enablement",
      },
      expected: "Software",
    },
    {
      name: "Factory integrated management enablement remains unclear",
      input: {
        description: "Factory Integrated Compute Cloud Management Server FIO Enablement",
      },
      expected: "Unclear",
    },
    {
      name: "Ball bearing rail kit",
      input: {
        description: "Ball Bearing Rail Kit",
      },
      expected: "Rail Kit",
    },
    {
      name: "Factory integrated rail kit remains unclear",
      input: {
        description: "Factory Integrated Ball Bearing Rail Kit",
      },
      expected: "Unclear",
    },
    {
      name: "Configuration tracking",
      input: {
        description: "Configuration Tracking",
      },
      expected: "Configuration",
    },
    {
      name: "Factory integrated configuration tracking remains unclear",
      input: {
        description: "Factory Integrated Configuration Tracking",
      },
      expected: "Unclear",
    },
    {
      name: "Air baffle cooling module",
      input: {
        description: "Air Baffle",
      },
      expected: "Cooling Module",
    },
    {
      name: "Factory integrated air baffle remains unclear",
      input: {
        description: "Factory Integrated Air Baffle",
      },
      expected: "Unclear",
    },
    {
      name: "Bezel kit",
      input: {
        description: "Bezel Kit",
      },
      expected: "Bezel",
    },
    {
      name: "Factory integrated bezel kit remains unclear",
      input: {
        description: "Factory Integrated Bezel Kit",
      },
      expected: "Unclear",
    },
    {
      name: "RAID controller",
      input: {
        description: "Smart Array RAID Controller for HPE",
      },
      expected: "RAID Controller",
    },
    {
      name: "SSD drive",
      input: {
        description: "960GB SATA SSD RI SFF",
      },
      expected: "SSD",
    },
    {
      name: "NVMe drive",
      input: {
        description: "1.92TB NVMe Gen4",
      },
      expected: "NVMe",
    },
    {
      name: "HDD drive",
      input: {
        description: "8TB 7.2K LFF HDD",
      },
      expected: "HDD",
    },
    {
      name: "Processor",
      input: {
        description: "Intel Xeon Processor",
      },
      expected: "CPU",
    },
    {
      name: "Fallback for unclear",
      input: {
        description: "Misc accessory",
      },
      expected: "Unclear",
    },
    {
      name: "PN exact overrides keywords",
      input: {
        description: "Power Supply",
        partNumber: "P19777-B21",
      },
      expected: "Network Adapter",
    },
    {
      name: "Fallback when description missing",
      input: {
        description: "",
      },
      expected: "Unclear",
    },
  ];

  for (const testCase of cases) {
    const result = classifyDeviceType(testCase.input);
    assert.equal(result.device_type, testCase.expected, testCase.name);
  }
});

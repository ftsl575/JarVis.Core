import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizePartNumber, normalizeText } from "../core/type-system/v1/normalize.js";

const RULES = JSON.parse(
  fs.readFileSync(new URL("../data/type-system/v1/rules.json", import.meta.url), "utf8")
);

const classifyByRules = (item = {}) => {
  const description = normalizeText(item.description);
  const partNumber = normalizePartNumber(item.partNumber || item.pn || item.product_number);

  if (partNumber && RULES.pn_exact?.[partNumber]) {
    const deviceType = RULES.pn_exact[partNumber];
    return { device_type: deviceType, matched_rule: `pn:${partNumber}` };
  }

  if (description) {
    for (const rule of RULES.keywords || []) {
      const pattern = normalizeText(rule.pattern);
      if (pattern && description.includes(pattern)) {
        return { device_type: rule.device_type, matched_rule: `kw:${pattern}` };
      }
    }
  }

  return { device_type: "Unclear", matched_rule: "fallback" };
};

test("rules v1 extended heuristics", () => {
  const cases = [
    {
      name: "Power cord wins over cable",
      input: { description: "C13 - C14 power cord" },
      expected: "Power Cord",
    },
    {
      name: "Transceiver optics",
      input: { description: "QSFP-100G-SR4 transceiver" },
      expected: "Transceiver",
    },
    {
      name: "SFP28 DAC cable",
      input: { description: "25G SFP28 DAC cable" },
      expected: "Cable",
    },
    {
      name: "Fibre Channel HBA",
      input: { description: "16Gb Fibre Channel HBA" },
      expected: "HBA",
    },
    {
      name: "Smart Array RAID Controller",
      input: { description: "Smart Array RAID Controller" },
      expected: "RAID Controller",
    },
    {
      name: "Power supply",
      input: { description: "1000W Flex Slot Hot Plug Power Supply" },
      expected: "PSU",
    },
    {
      name: "Fan module",
      input: { description: "Hot-swap blower fan module" },
      expected: "Fan",
    },
    {
      name: "Cooling module",
      input: { description: "CPU heatsink with retention bracket" },
      expected: "Cooling Module",
    },
    {
      name: "Disk enclosure",
      input: { description: "12-bay JBOD disk shelf" },
      expected: "Disk Enclosure",
    },
    {
      name: "Backplane",
      input: { description: "Storage backplane board" },
      expected: "Backplane",
    },
    {
      name: "Tape library",
      input: { description: "LTO-8 tape library autoloader" },
      expected: "Tape Library",
    },
    {
      name: "Blade chassis",
      input: { description: "HPE C7000 blade enclosure" },
      expected: "Blade Chassis",
    },
    {
      name: "Fabric interconnect",
      input: { description: "Cisco UCS FI 6332 fabric interconnect" },
      expected: "Fabric Interconnect",
    },
    {
      name: "Network switch",
      input: { description: "Cisco Nexus switch" },
      expected: "Network Switch",
    },
    {
      name: "Router",
      input: { description: "Cisco ISR router" },
      expected: "Router",
    },
    {
      name: "Firewall",
      input: { description: "Juniper SRX firewall" },
      expected: "Firewall",
    },
    {
      name: "Network interface card",
      input: { description: "Dual-port 25GbE OCP NIC" },
      expected: "Network Interface Card",
    },
    {
      name: "CPU",
      input: { description: "AMD EPYC processor" },
      expected: "CPU",
    },
    {
      name: "RAM",
      input: { description: "32GB DDR5 RDIMM" },
      expected: "RAM",
    },
    {
      name: "GPU",
      input: { description: "NVIDIA A100 GPU" },
      expected: "GPU",
    },
    {
      name: "Battery",
      input: { description: "RAID BBU battery pack" },
      expected: "Battery",
    },
    {
      name: "PDU",
      input: { description: "Rack PDU with 24 outlets" },
      expected: "PDU",
    },
    {
      name: "UPS",
      input: { description: "UPS backup unit" },
      expected: "UPS",
    },
    {
      name: "License",
      input: { description: "Support subscription license" },
      expected: "License",
    },
    {
      name: "Generic upgrade kit stays unclear",
      input: { description: "Upgrade Kit" },
      expected: "Unclear",
    },
  ];

  for (const testCase of cases) {
    const result = classifyByRules(testCase.input);
    assert.equal(result.device_type, testCase.expected, testCase.name);
  }
});

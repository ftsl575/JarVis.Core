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
      name: "SFP28 SR transceiver",
      input: { description: "25G SFP28 SR optical transceiver" },
      expected: "Transceiver",
    },
    {
      name: "SFP28 DAC cable",
      input: { description: "25G SFP28 DAC cable" },
      expected: "Cable",
    },
    {
      name: "QSFP56 AOC cable",
      input: { description: "QSFP56 AOC cable 3m" },
      expected: "Cable",
    },
    {
      name: "Fibre Channel HBA",
      input: { description: "16Gb Fibre Channel HBA" },
      expected: "HBA",
    },
    {
      name: "Fibre Channel host bus adapter",
      input: { description: "32Gb Fibre Channel Host Bus Adapter" },
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
      name: "NVIDIA PCIe accelerator",
      input: { description: "NVIDIA PCIe Accelerator" },
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
      name: "MR216i-o storage controller",
      input: {
        description: "HPE MR216i-o Storage Controller",
      },
      expected: "RAID Controller",
    },
    {
      name: "MR216i-o storage controller with extended description",
      input: {
        description:
          "HPE MR216i-o Gen11 x16 Lanes without Cache OCP SPDM Storage Controller",
      },
      expected: "RAID Controller",
    },
    {
      name: "MR408i controller",
      input: {
        description: "MR408i Controller",
      },
      expected: "RAID Controller",
    },
    {
      name: "Intel E810-CQDA2 Ethernet adapter",
      input: {
        description: "Intel E810-CQDA2 Ethernet 100Gb 2-port QSFP28 Adapter",
      },
      expected: "Network Interface Card",
    },
    {
      name: "Intel E810-CQDA2 Ethernet adapter for HPE",
      input: {
        description: "Intel E810-CQDA2 Ethernet 100Gb 2-port QSFP28 Adapter for HPE",
      },
      expected: "Network Interface Card",
    },
    {
      name: "Intel E810-CQDA2 Ethernet QSFP28 adapter",
      input: {
        description: "Intel E810-CQDA2 Ethernet 100Gb QSFP28 Adapter",
      },
      expected: "Network Interface Card",
    },
    {
      name: "Intel E810-CQDA2 Ethernet 100Gb adapter",
      input: {
        description: "Intel E810-CQDA2 Ethernet 100Gb Adapter",
      },
      expected: "Network Interface Card",
    },
    {
      name: "Broadcom Ethernet adapter",
      input: {
        description: "Broadcom Ethernet Adapter",
      },
      expected: "Network Interface Card",
    },
    {
      name: "OCP slot cable kit",
      input: {
        description: "CPU1 to Rear OCP SlotB x8 Cable Kit (P72203-B21)",
        partNumber: "P72203-B21",
      },
      expected: "Cable",
    },
    {
      name: "OROC controller cable kit",
      input: {
        description: "OROC Controller Cable Kit",
      },
      expected: "Cable",
    },
    {
      name: "OROC controller cable kit with PN",
      input: {
        description: "OROC 8SFF x2 Controller Cable Kit (P76454-B21)",
        partNumber: "P76454-B21",
      },
      expected: "Cable",
    },
    {
      name: "High performance fan kit",
      input: {
        description: "High Performance Fan Kit",
      },
      expected: "Fan",
    },
    {
      name: "Performance heat sink kit",
      input: {
        description: "Performance Heat Sink Kit (P74792-B21)",
        partNumber: "P74792-B21",
      },
      expected: "Cooling Module",
    },
    {
      name: "Performance heat sink kit (no PN)",
      input: {
        description: "Performance Heat Sink Kit",
      },
      expected: "Cooling Module",
    },
    {
      name: "Tri-Mode drive cage kit stays unclear",
      input: {
        description: "Tri-Mode Drive Cage Kit",
      },
      expected: "Unclear",
    },
    {
      name: "Generic upgrade kit stays unclear",
      input: { description: "Upgrade Kit" },
      expected: "Unclear",
    },
    {
      name: "Easy install rail kit stays unclear",
      input: { description: "Easy Install Rail Kit" },
      expected: "Unclear",
    },
    {
      name: "Enablement kit stays unclear",
      input: { description: "Enablement Kit" },
      expected: "Unclear",
    },
    {
      name: "Configuration stays unclear",
      input: { description: "Configuration" },
      expected: "Unclear",
    },
  ];

  for (const testCase of cases) {
    const result = classifyByRules(testCase.input);
    assert.equal(result.device_type, testCase.expected, testCase.name);
  }
});
